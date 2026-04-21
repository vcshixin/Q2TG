import { Sendable, ForwardMessage, Forwardable, Quotable, Image, ImageElem, VideoElem, PttElem, Converter, MusicPlatform, JsonElem, LongMsgElem } from "../message";
import { ShareConfig, ShareContent } from "../message/share";
type Client = import("../client").Client;
/** 所有用户和群的基类 */
export declare abstract class Contactable {
    protected readonly c: Client;
    /** 对方QQ号 */
    protected uin?: number;
    /** 对方uid */
    protected _uid?: string;
    /** 对方群号 */
    protected gid?: number;
    /** 对方uid */
    get uid(): string | undefined;
    get target(): number;
    get dm(): boolean;
    /** 返回所属的客户端对象 */
    get client(): import("../client").Client;
    protected constructor(c: Client);
    get [Symbol.unscopables](): {
        c: boolean;
    };
    private _offPicUp;
    private _groupPicUp;
    /** 上传一批图片以备发送(无数量限制)，理论上传一次所有群和好友都能发 */
    uploadImages(_imgs: Image[] | ImageElem[]): Promise<PromiseRejectedResult[]>;
    private _uploadImage;
    /** 发送网址分享 */
    shareUrl(content: ShareContent, config?: ShareConfig): Promise<void>;
    /** 发送音乐分享 */
    shareMusic(platform: MusicPlatform, id: string): Promise<void>;
    /** 发消息预处理 */
    protected _preprocess(content: Sendable, source?: Quotable): Promise<Converter>;
    private _downloadFileToTmpDir;
    private _saveFileToTmpDir;
    /** 上传一个视频以备发送(理论上传一次所有群和好友都能发) */
    uploadVideo(elem: VideoElem): Promise<VideoElem>;
    /** 上传一个语音以备发送(理论上传一次所有群和好友都能发) */
    uploadPtt(elem: PttElem, transcoding?: boolean, brief?: string): Promise<PttElem>;
    private _newUploadMultiMsg;
    private _uploadMultiMsg;
    uploadLongMsg(content: Sendable | Converter, source?: Quotable, isNT?: boolean | undefined): Promise<LongMsgElem>;
    /**
     * 制作一条合并转发消息以备发送（制作一次可以到处发）
     * 需要注意的是，好友图片和群图片的内部格式不一样，对着群制作的转发消息中的图片，发给好友可能会裂图，反过来也一样
     * 支持4层套娃转发（PC仅显示3层）
     */
    makeForwardMsg(msglist: Forwardable[] | Forwardable): Promise<JsonElem>;
    /** 下载并解析合并转发 */
    getForwardMsg(resid: string, fileName?: string): Promise<ForwardMessage[]>;
    private _newDownloadMultiMsg;
    private _downloadMultiMsg;
    /** 获取视频下载地址 */
    getVideoUrl(elem: VideoElem | string, md5?: string | Buffer): Promise<string | null>;
    getNTVideoUrl(elem: VideoElem): Promise<string | null>;
    getPttUrl(elem: PttElem): Promise<string | null | undefined>;
    private getNTPttUrl;
    /**
     * 获取QQNT图片rkey
     * @this {import("../client").Client}
     */
    getNTPicRkey(): Promise<any>;
    /**
     * 获取QQNT群图rkey
     * @deprecated
     * @this {import("../client").Client}
     */
    getGroupNTPicRkey(): Promise<string>;
    /**
     * 获取QQNT私聊图rkey
     * @deprecated
     * @this {import("../client").Client}
     */
    getOffNTPicRkey(): Promise<string>;
    /**
     * 获取QQNT群图URL
     * @this {import("../client").Client}
     * @param {Object} imgInfo
     * @param {number} gid
     */
    getGroupNTPicURL(imgInfo: any, gid: number | undefined): Promise<string | null>;
    /**
     * 获取QQNT私聊图URL
     * @this {import("../client").Client}
     * @param {Object} imgInfo
     * @param {String} uid
     */
    getOffNTPicURL(imgInfo: any, uid: any): Promise<string | null>;
    /**
     * 通过fileid获取QQNT图片URL
     * @this {import("../client").Client}
     * @param {string} fileid
     */
    getNTPicURLbyFileid(fileid: string): Promise<string>;
    /**
     * 通过fileid获取图片url
     * @this {import("../client").Client}
     * @param {string} fileid
     */
    getNTPicURLbyFileidApi(fileid: string): Promise<{
        result: number;
        data: string;
    }>;
    /**
     * 通过fileid获取图片信息
     * @this {import("../client").Client}
     * @param {string} fileid
     */
    getNTPicInfobyFileid(fileid: string): Promise<{
        uin: any;
        md5: any;
        size: any;
        appid: any;
        time: any;
        expires: any;
    }>;
}
export declare function getPttBuffer(file: string | Buffer, transcoding?: boolean, ffmpeg?: string): Promise<Buffer>;
export {};
