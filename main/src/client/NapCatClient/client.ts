import { CreateQQClientParamsBase, ForwardMessage, Friend, FriendIncreaseEvent, Group, GroupMemberDecreaseEvent, GroupMemberIncreaseEvent, GroupNameChangeEvent, InputStatusChangeEvent, MessageEvent, MessageRecallEvent, PokeEvent, QQClient, SendableElem } from '../QQClient';
import random from '../../utils/random';
import { getLogger, Logger } from 'log4js';
import posthog from '../../models/posthog';
import type { Receive, WSReceiveHandler, WSSendParam, WSSendReturn } from 'node-napcat-ts';
import { NapCatFriend, NapCatGroup } from './entity';
import { napCatReceiveToMessageElem } from './convert';
import { NapCatFriendRequestEvent, NapCatGroupEvent, NapCatGroupInviteEvent } from './event';
import type { ImageElem } from '@icqqjs/icqq';
import ReconnectingWebSocket from 'reconnecting-websocket';

export interface CreateNapCatParams extends CreateQQClientParamsBase {
  type: 'napcat';
  wsUrl: string;
}

export class NapCatClient extends QQClient {
  private constructor(id: number, private readonly wsUrl: string) {
    super(id);
    this.logger = getLogger(`NapCatClient - ${id}`);
    this.ws = new ReconnectingWebSocket(wsUrl);
    this.ws.onmessage = (e) => this.handleWebSocketMessage(e.data);
  }

  private readonly ws: ReconnectingWebSocket;
  private readonly logger: Logger;
  private readonly friendCache = new Map<number, { nickname: string; remark: string; updatedAt: number }>();
  private friendCacheRefreshPromise?: Promise<void>;
  private readonly friendCacheTtlMs = 15 * 60 * 1000;
  private friendCacheLastRefreshAt = 0;
  private readonly pendingOutgoingSelfMessages: Array<{ dm: boolean; chatId: number; expiresAt: number }> = [];
  private readonly sentOutgoingSelfMessageIds = new Map<string, number>();
  private readonly outgoingSelfMessageTtlMs = 60 * 1000;

  public static async create(params: CreateNapCatParams) {
    const instance = new this(params.id, params.wsUrl);
    return new Promise<NapCatClient>((resolve, reject) => {
      instance.ws.onopen = async () => {
        instance.logger.info('WS 连接成功');
        instance.ws.onerror = null;
        await instance.refreshSelf();
        resolve(instance);
      };
      instance.ws.onerror = (e) => {
        instance.logger.error('WS 连接出错', e);
        posthog.capture('WS 连接出错', { error: e });
        reject(e);
      };
    });
  }

  private readonly echoMap = new Map<string, { resolve: (result: any) => void; reject: (result: any) => void }>();
  private echoSeq = 0;

  public async callApi<T extends keyof WSSendReturn>(action: T, params?: WSSendParam[T]): Promise<WSSendReturn[T]> {
    return new Promise<WSSendReturn[T]>((resolve, reject) => {
      const echo = `${new Date().getTime()}-${this.echoSeq++}-${random.int(100000, 999999)}`;
      this.echoMap.set(echo, { resolve, reject });
      this.ws.send(JSON.stringify({ action, params, echo }));
      this.logger.debug('send', JSON.stringify({ action, params, echo }));
    });
  }

  public markOutgoingSelfMessage(dm: boolean, chatId: number) {
    this.cleanupOutgoingSelfMessages();
    const entry = { dm, chatId, expiresAt: Date.now() + this.outgoingSelfMessageTtlMs };
    this.pendingOutgoingSelfMessages.push(entry);
    return () => {
      const index = this.pendingOutgoingSelfMessages.indexOf(entry);
      if (index >= 0) this.pendingOutgoingSelfMessages.splice(index, 1);
    };
  }

  public markOutgoingSelfMessageId(dm: boolean, chatId: number, messageId: number | string) {
    this.cleanupOutgoingSelfMessages();
    this.sentOutgoingSelfMessageIds.set(this.outgoingSelfMessageKey(dm, chatId, messageId), Date.now() + this.outgoingSelfMessageTtlMs);
  }

  private shouldSkipOutgoingSelfMessage(data: WSReceiveHandler['message']) {
    this.cleanupOutgoingSelfMessages();
    const dm = data.message_type === 'private';
    const chatId = dm ? data.user_id : data.group_id;
    const key = this.outgoingSelfMessageKey(dm, chatId, data.message_id);
    if (this.sentOutgoingSelfMessageIds.has(key)) {
      this.sentOutgoingSelfMessageIds.delete(key);
      return true;
    }
    const index = this.pendingOutgoingSelfMessages.findIndex(it => it.dm === dm && it.chatId === chatId);
    if (index >= 0) {
      this.pendingOutgoingSelfMessages.splice(index, 1);
      return true;
    }
    return false;
  }

  private outgoingSelfMessageKey(dm: boolean, chatId: number, messageId: number | string) {
    return `${dm ? 'private' : 'group'}:${chatId}:${messageId}`;
  }

  private cleanupOutgoingSelfMessages() {
    const now = Date.now();
    for (let i = this.pendingOutgoingSelfMessages.length - 1; i >= 0; i--) {
      if (this.pendingOutgoingSelfMessages[i].expiresAt <= now) this.pendingOutgoingSelfMessages.splice(i, 1);
    }
    for (const [key, expiresAt] of this.sentOutgoingSelfMessageIds) {
      if (expiresAt <= now) this.sentOutgoingSelfMessageIds.delete(key);
    }
  }

  private async handleWebSocketMessage(message: string) {
    this.logger.debug('receive', message);
    const data = JSON.parse(message) as WSReceiveHandler[keyof WSReceiveHandler] & { echo: string; status: 'ok' | 'error'; data: any; message: string };
    if (data.echo) {
      const promise = this.echoMap.get(data.echo);
      if (!promise) return;
      this.echoMap.delete(data.echo);
      if (data.status === 'ok') {
        promise.resolve(data.data);
      }
      else {
        promise.reject(data.message);
      }
      return;
    }
    if (data.post_type === 'message' || data.post_type === 'message_sent')
      await this.handleMessage(data as WSReceiveHandler['message'], data.post_type === 'message_sent');
    else if (data.post_type === 'notice' && data.notice_type === 'group_increase')
      await this.handleGroupIncrease(data);
    else if (data.post_type === 'notice' && data.notice_type === 'group_decrease')
      await this.handleGroupDecrease(data);
    else if (data.post_type === 'notice' && data.notice_type === 'friend_add')
      await this.handleFriendIncrease(data);
    else if (data.post_type === 'notice' && data.notice_type === 'friend_recall')
      await this.handleMessageRecall(data);
    else if (data.post_type === 'notice' && data.notice_type === 'group_recall')
      await this.handleMessageRecall(data);
    else if (data.post_type === 'notice' && data.notice_type === 'notify' && data.sub_type === 'poke')
      await this.handlePoke(data);
    else if (data.post_type === 'notice' && data.notice_type === 'notify' && data.sub_type === 'input_status')
      await this.handleInput(data);
    // @ts-ignore
    else if (data.post_type === 'notice' && data.notice_type === 'notify' && data.sub_type === 'group_name')
      await this.handleGroupNameChange(data);
    else if (data.post_type === 'request' && data.request_type === 'friend')
      await this.handleFriendRequest(data);
    else if (data.post_type === 'request' && data.request_type === 'group' && data.sub_type === 'invite')
      await this.handleGroupRequest(data);
  }

  public uin: number;
  public nickname: string;

  private async handleMessage(data: WSReceiveHandler['message'], self = false) {
    if (self && this.shouldSkipOutgoingSelfMessage(data)) return;
    let chat: Friend | Group;
    if (data.message_type === 'private') {
      // sender 一定是对方
      chat = NapCatFriend.createExisted(this, { uid: data.user_id, remark: data.sender.card, nickname: data.sender.nickname });
    }
    else {
      // 上报没有群名
      chat = await this.pickGroup(data.group_id);
    }
    const senderName = data.message_type === 'group'
      ? await this.resolveGroupMemberDisplayName(data.sender.user_id, data.sender.card, data.sender.nickname)
      : (data.sender.card || data.sender.nickname);
    const message = (data.message as unknown as Receive[keyof Receive][]);
    const replyNode = message.find(it => it.type === 'reply');
    if (replyNode) {
      message.splice(message.indexOf(replyNode), 1);
    }
    const replyMessage = replyNode ? await this.getMessage(replyNode.data.id) : undefined;
    const event = new MessageEvent(
      { id: data.sender.user_id, card: data.sender.card, nickname: data.sender.nickname, name: senderName },
      chat,
      message.map(napCatReceiveToMessageElem),
      data.message_id,
      0, 0,
      data.time,
      data.raw_message,
      replyMessage ? {
        message: (replyMessage as any).message.filter(it => it.type !== 'reply').map(napCatReceiveToMessageElem),
        rand: 0, fromId: replyMessage.sender.user_id, seq: replyMessage.message_id, time: replyMessage.time,
      } : undefined,
      undefined,
      data.message_id.toString(),
      replyMessage?.sender.user_id === this.uin || message.some(it => it.type === 'at' && it.data.qq.toString() === this.uin.toString()),
      message.some(it => it.type === 'at' && (it.data.qq.toString() === '0' || !it.data.qq || it.data.qq === 'all')),
      undefined,
      self,
    );
    for (const handler of this.onMessageHandlers) {
      if (await handler(event)) {
        break;
      }
    }
  }

  private async handleGroupIncrease(data: WSReceiveHandler['notice.group_increase']) {
    const user = await this.callApi('get_stranger_info', { user_id: data.user_id });
    this.updateFriendCacheEntry({ uid: data.user_id, nickname: user.nickname, remark: user.remark || '' });
    const event = new GroupMemberIncreaseEvent(await this.pickGroup(data.group_id), data.user_id, user.remark || user.nickname);
    await this.callHandlers(this.onGroupMemberIncreaseHandlers, event);
  }

  private async handleGroupDecrease(data: WSReceiveHandler['notice.group_decrease']) {
    const event = new GroupMemberDecreaseEvent(await this.pickGroup(data.group_id), data.user_id, data.operator_id, false);
    await this.callHandlers(this.onGroupMemberDecreaseHandlers, event);
  }

  private async handleFriendIncrease(data: WSReceiveHandler['notice.friend_add']) {
    const event = new FriendIncreaseEvent(await NapCatFriend.create(this, data.user_id));
    await this.callHandlers(this.onFriendIncreaseHandlers, event);
  }

  private async handleMessageRecall(data: WSReceiveHandler['notice.friend_recall'] | WSReceiveHandler['notice.group_recall']) {
    const chat = data.notice_type === 'friend_recall' ? await this.pickFriend(data.user_id) : await this.pickGroup(data.group_id);
    const event = new MessageRecallEvent(chat, data.message_id, 0, data.time);
    await this.callHandlers(this.onMessageRecallHandlers, event);
  }

  private async handlePoke(data: WSReceiveHandler['notice.notify.poke.group'] | WSReceiveHandler['notice.notify.poke.friend']) {
    const nonSelfId = data.user_id === this.uin ? data.target_id : data.user_id;
    const chat = 'group_id' in data ? await this.pickGroup(data.group_id) : await this.pickFriend(nonSelfId);
    const operator = 'sender_id' in data ? data.sender_id as number : data.user_id;
    const nors: any[] = data.raw_info?.filter(it => (it.type as any) === 'nor') || [];
    const event = new PokeEvent(chat, operator, data.target_id, nors[0]?.txt, nors[1]?.txt);
    await this.callHandlers(this.onPokeHandlers, event);
  }

  private async handleInput(data: WSReceiveHandler['notice.notify.input_status']) {
    await this.callHandlers(this.onInputStatusChangeHandlers, new InputStatusChangeEvent(await this.pickFriend(data.user_id), !!data.status_text));
  }

  private async handleGroupNameChange(data: { group_id: number; user_id: number; name_new: string }) {
    const group = await this.pickGroup(data.group_id);
    await this.callHandlers(this.onGroupNameChangeHandlers, new GroupNameChangeEvent(group, group.pickMember(data.user_id), data.name_new));
  }

  private async handleFriendRequest(data: WSReceiveHandler['request.friend']) {
    const event = await NapCatFriendRequestEvent.create(this, data);
    await this.callHandlers(this.onFriendRequestHandlers, event);
  }

  private async handleGroupRequest(data: WSReceiveHandler['request.group']) {
    const event = await NapCatGroupEvent.create(this, data);
    // 上面过滤过了
    await this.callHandlers(this.onGroupInviteHandlers, event as NapCatGroupInviteEvent);
  }

  public async getMessage(messageId: number | string) {
    return await this.callApi('get_msg', { message_id: messageId as any });
  }

  public async refreshSelf() {
    const data = await this.callApi('get_login_info');
    this.uin = data.user_id;
    this.nickname = data.nickname;
    await this.ensureFriendCache();
  }

  public async isOnline(): Promise<boolean> {
    const data = await this.callApi('get_status');
    return data.online;
  }

  private normalizeFriendInfo(info: any) {
    return {
      nickname: info.nick || info.nickname || '',
      uid: parseInt(info.uin || info.user_id),
      remark: info.remark || '',
    };
  }

  public updateFriendCacheEntry(info: { nickname: string; uid: number; remark: string }) {
    if (!Number.isFinite(info.uid)) return;
    this.friendCache.set(info.uid, {
      nickname: info.nickname || '',
      remark: info.remark || '',
      updatedAt: Date.now(),
    });
  }

  public getCachedFriendDisplayName(userId: number, fallback?: string) {
    const cached = this.friendCache.get(userId);
    return cached?.remark || fallback || cached?.nickname || '';
  }

  public async ensureFriendCache(force = false) {
    if (!force && this.friendCache.size && Date.now() - this.friendCacheLastRefreshAt < this.friendCacheTtlMs) {
      return;
    }
    if (!force && this.friendCacheRefreshPromise) {
      await this.friendCacheRefreshPromise;
      return;
    }
    const refresh = this.refreshFriendCache();
    this.friendCacheRefreshPromise = refresh;
    try {
      await refresh;
    }
    finally {
      if (this.friendCacheRefreshPromise === refresh) {
        this.friendCacheRefreshPromise = undefined;
      }
    }
  }

  public async refreshFriendCache() {
    const data = await this.callApi('get_friends_with_category');
    const nextCache = new Map<number, { nickname: string; remark: string; updatedAt: number }>();
    const put = (raw: any) => {
      const friend = this.normalizeFriendInfo(raw);
      if (!Number.isFinite(friend.uid)) return;
      nextCache.set(friend.uid, {
        nickname: friend.nickname,
        remark: friend.remark,
        updatedAt: Date.now(),
      });
    };
    if (data[0]?.buddyList === undefined) {
      for (const entry of data as any[]) {
        put(entry);
      }
    }
    else {
      for (const category of data as any[]) {
        for (const friend of category.buddyList || []) {
          put(friend);
        }
      }
    }
    this.friendCache.clear();
    for (const [uid, friend] of nextCache.entries()) {
      this.friendCache.set(uid, friend);
    }
    this.friendCacheLastRefreshAt = Date.now();
  }

  public async resolveFriendDisplayName(userId: number, fallback?: string) {
    const cached = this.friendCache.get(userId);
    if (cached && Date.now() - cached.updatedAt < this.friendCacheTtlMs) {
      return cached.remark || fallback || cached.nickname || '';
    }

    if (!this.friendCache.size) {
      await this.ensureFriendCache();
      const refreshed = this.friendCache.get(userId);
      if (refreshed) {
        return refreshed.remark || fallback || refreshed.nickname || '';
      }
    }

    try {
      const friend = await NapCatFriend.create(this, userId);
      this.updateFriendCacheEntry({ uid: userId, nickname: friend.nickname, remark: friend.remark });
      return friend.remark || fallback || friend.nickname || '';
    }
    catch {
      return cached?.remark || fallback || cached?.nickname || '';
    }
  }

  public async resolveGroupMemberDisplayName(userId: number, card?: string, nickname?: string) {
    return await this.resolveFriendDisplayName(userId, card || nickname || '');
  }

  public async decorateForwardMessages(messages: ForwardMessage[]) {
    await Promise.all(messages.map(async (message) => {
      message.nickname = await this.resolveFriendDisplayName(message.user_id, message.nickname);
    }));
    return messages;
  }

  public async getFriendsWithCluster(): Promise<{ name: string; friends: Friend[]; }[]> {
    const data = await this.callApi('get_friends_with_category');
    if (data[0].buddyList === undefined) {
      const categories = new Map<number, { name: string; friends: Friend[]; }>();
      for (const entry of data as any[]) {
        const friend = this.normalizeFriendInfo(entry);
        this.updateFriendCacheEntry(friend);
        let category = categories.get(entry.categoryId);
        if (!category) {
          category = { name: entry.categoryName || entry.categroyName, friends: [] };
          categories.set(entry.categoryId, category);
        }
        category.friends.push(NapCatFriend.createExisted(this, friend));
      }
      return Array.from(categories.values());
    }
    return (data as any[]).map(category => ({
      name: category.categoryName || category.categroyName, // typo in API
      friends: (category.buddyList || []).map((friend: any) => {
        const normalized = this.normalizeFriendInfo(friend);
        this.updateFriendCacheEntry(normalized);
        return NapCatFriend.createExisted(this, normalized);
      }),
    }));
  }

  public async pickFriend(uin: number, tempChatFromGroupId?: number): Promise<Friend> {
    const cached = this.friendCache.get(uin);
    if (cached) {
      return NapCatFriend.createExisted(this, {
        uid: uin,
        nickname: cached.nickname,
        remark: cached.remark,
      });
    }
    const friend = await NapCatFriend.create(this, uin);
    this.updateFriendCacheEntry({ uid: uin, nickname: friend.nickname, remark: friend.remark });
    return friend;
  }

  public async getGroupList(): Promise<Group[]> {
    const data = await this.callApi('get_group_list');
    return data.map(it => NapCatGroup.createExisted(this, {
      gid: it.group_id,
      name: it.group_name,
    }));
  }

  public pickGroup(groupId: number): Promise<Group> {
    return NapCatGroup.create(this, groupId);
  }

  override async createSpoilerImageEndpoint(image: ImageElem, nickname: string, title?: string): Promise<SendableElem[]> {
    const res: SendableElem[] = [
      {
        type: 'node',
        user_id: this.uin,
        nickname,
        message: image,
      },
    ];
    if (title) {
      res.push({
        type: 'node',
        user_id: this.uin,
        nickname,
        message: {
          type: 'text',
          text: title,
        },
      });
    }
    return res;
  }
}
