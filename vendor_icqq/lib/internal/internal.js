"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OcrResult = void 0;
exports.setStatus = setStatus;
exports.setSign = setSign;
exports.setPersonalSign = setPersonalSign;
exports.getUserProfile = getUserProfile;
exports.setAvatar = setAvatar;
exports.getStamp = getStamp;
exports.delStamp = delStamp;
exports.addClass = addClass;
exports.delClass = delClass;
exports.renameClass = renameClass;
exports.loadFL = loadFL;
exports.loadSL = loadSL;
exports.loadGPL = loadGPL;
exports.loadGL = loadGL;
exports.loadBL = loadBL;
exports.imageOcr = imageOcr;
const core_1 = require("../core");
const errors_1 = require("../errors");
const common_1 = require("../common");
const highway_1 = require("./highway");
const guild_1 = require("../guild");
const d50 = core_1.pb.encode({
    1: 10002,
    91001: 1,
    101001: 1,
    151001: 1,
    181001: 1,
    251001: 1,
});
async function setStatus(status) {
    if (!status || [core_1.Platform.Watch].includes(this.config.platform))
        return false;
    const d = this.device;
    const SvcReqRegister = core_1.jce.encodeStruct([
        this.uin,
        7, 0, "", Number(status), 0, 0, 0, 0, 0, 248,
        d.version.sdk, 0, "", 0, null, d.guid, 2052, 0, d.model, d.model,
        d.version.release, 1, 473, 0, null, 0, 0, "", 0, "",
        "", "", null, 1, null, 0, null, 0, 0
    ]);
    const body = core_1.jce.encodeWrapper({ SvcReqRegister }, "PushService", "SvcReqRegister");
    const payload = await this.sendUni("StatSvc.SetStatusFromClient", body);
    const ret = !!core_1.jce.decodeWrapper(payload)[9];
    if (ret)
        this.status = Number(status);
    return ret;
}
/**
 * 设置个性签名
 * @deprecated 请使用 setPersonalSign
 * @param sign {string} 签名
 */
async function setSign(sign) {
    return await setPersonalSign.call(this, sign);
}
/**
 * 设置个性签名
 * @param sign {string} 签名
 */
async function setPersonalSign(sign) {
    const buf = Buffer.from(String(sign)).slice(0, 254);
    const body = core_1.pb.encode({
        1: 2,
        2: Date.now(),
        3: {
            1: 109,
            2: { 6: 825110830 },
            3: this.apk.ver
        },
        5: {
            1: this.uin,
            2: 0,
            3: 27 + buf.length,
            4: Buffer.concat([
                Buffer.from([0x3, buf.length + 1, 0x20]), buf,
                Buffer.from([0x91, 0x04, 0x00, 0x00, 0x00, 0x00, 0x92, 0x04, 0x00, 0x00, 0x00, 0x00, 0xA2, 0x04, 0x00, 0x00, 0x00, 0x00, 0xA3, 0x04, 0x00, 0x00, 0x00, 0x00])
            ]),
            5: 0
        },
        6: 1
    });
    const payload = await this.sendUni("Signature.auth", body);
    return core_1.pb.decode(payload)[1] === 0;
}
async function getUserProfile(uin = this.uin) {
    const body = {
        1: uin,
        3: [20002, 27394, 20009, 20031, 101, 103, 102, 20022, 20023, 20024, 24002, 27037, 27049, 20011, 20016, 20021, 20003, 20004, 20005, 20006, 20020, 20026, 24007, 104, 105, 42432, 42362, 41756, 41757, 42257, 27372, 42315, 107, 45160, 45161, 27406, 62026, 20037]
            .map(i => ({ 1: i }))
    };
    const result = await this.sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0xfe1_2', core_1.pb.encode(body));
    const info = result[1][2];
    const profile = {};
    info[1].concat(info[2]).forEach((item) => {
        profile[item["1"]] = item["2"];
    });
    // 有需要自己加！
    return {
        nickname: String(profile[20002]),
        country: String(profile[20003]),
        province: String(profile[20004]),
        city: String(profile[20020]),
        email: String(profile[20011]),
        birthday: profile[20031].toBuffer().length === 4 ?
            [profile[20031].toBuffer().slice(0,2).readUInt16BE(), profile[20031].toBuffer().slice(2,3).readUInt8(), profile[20031].toBuffer().slice(3).readUInt8()] :
            undefined,
        signature: String(profile[102]),
        regTimestamp: profile[20026],
        QID: String(profile[27394])
    };
}
async function setAvatar(img) {
    await img.task;
    const body = core_1.pb.encode({
        1281: {
            1: this.uin,
            2: 0,
            3: 16,
            4: 1,
            6: 3,
            7: 5,
        }
    });
    const payload = await this.sendUni("HttpConn.0x6ff_501", body);
    const rsp = core_1.pb.decode(payload)[1281];
    await highway_1.highwayUpload.call(this, img.readable, {
        cmdid: highway_1.CmdID.SelfPortrait,
        md5: img.md5,
        size: img.size,
        ticket: rsp[1].toBuffer()
    }, rsp[3][2][0][2], rsp[3][2][0][3]);
    img.deleteTmpFile();
}
async function getStamp(no_cache = false) {
    if (this.stamp.size > 0 && !no_cache)
        return Array.from(this.stamp).map(x => `https://p.qpic.cn/${this.bid}/${this.uin}/${x}/0`);
    const body = core_1.pb.encode({
        1: {
            1: 109,
            2: "7.1.2",
            3: this.apk.ver
        },
        2: this.uin,
        3: 1,
    });
    const payload = await this.sendUni("Faceroam.OpReq", body);
    const rsp = core_1.pb.decode(payload);
    if (rsp[1] !== 0)
        (0, errors_1.drop)(rsp[1], rsp[2]);
    if (rsp[4][1]) {
        this.bid = String(rsp[4][3]);
        this.stamp = new Set((Array.isArray(rsp[4][1]) ? rsp[4][1] : [rsp[4][1]]).map(x => String(x)));
    }
    else {
        this.stamp = new Set;
    }
    return Array.from(this.stamp).map(x => `https://p.qpic.cn/${this.bid}/${this.uin}/${x}/0`);
}
async function delStamp(id) {
    const body = core_1.pb.encode({
        1: {
            1: 109,
            2: "7.1.2",
            3: this.apk.ver,
        },
        2: this.uin,
        3: 2,
        5: {
            1: id
        },
    });
    await this.sendUni("Faceroam.OpReq", body);
    for (let s of id)
        this.stamp.delete(s);
}
async function addClass(name) {
    const len = Buffer.byteLength(name);
    const buf = Buffer.allocUnsafe(2 + len);
    buf.writeUInt8(0xd);
    buf.writeUInt8(len, 1);
    buf.fill(name, 2);
    const SetGroupReq = core_1.jce.encodeStruct([
        0, this.uin, buf
    ]);
    const body = core_1.jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq");
    await this.sendUni("friendlist.SetGroupReq", body);
}
async function delClass(id) {
    const SetGroupReq = core_1.jce.encodeStruct([
        2, this.uin, Buffer.from([Number(id)])
    ]);
    const body = core_1.jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq");
    await this.sendUni("friendlist.SetGroupReq", body);
}
async function renameClass(id, name) {
    const len = Buffer.byteLength(name);
    const buf = Buffer.allocUnsafe(2 + len);
    buf.writeUInt8(Number(id));
    buf.writeUInt8(len, 1);
    buf.fill(name, 2);
    const SetGroupReq = core_1.jce.encodeStruct([
        1, this.uin, buf
    ]);
    const body = core_1.jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq");
    await this.sendUni("friendlist.SetGroupReq", body);
}
async function loadFL() {
    const set = new Set();
    let start = 0, limit = 150;
    while (true) {
        const FL = core_1.jce.encodeStruct([
            3,
            1, this.uin, start, limit, 0,
            1, 0, 100, 0, 1,
            41, null, 0, 0, 0,
            d50, null, [13580, 13581, 13582]
        ]);
        const body = core_1.jce.encodeWrapper({ FL }, "mqq.IMService.FriendListServiceServantObj", "GetFriendListReq");
        const payload = await this.sendUni("friendlist.getFriendGroupList", body, 10);
        const nested = core_1.jce.decodeWrapper(payload);
        this.classes.clear();
        for (let v of nested[14])
            this.classes.set(v[0], v[1]);
        for (let v of nested[7]) {
            const uin = v[0];
            const info = {
                user_id: uin,
                nickname: v[14] || "",
                sex: v[31] ? (v[31] === 1 ? "male" : "female") : "unknown",
                remark: v[3] || "",
                class_id: v[1],
                uid: v[63]
            };
            this.fl.set(uin, Object.assign(this.fl.get(uin) || {}, info));
            set.add(uin);
        }
        start += limit;
        const num = nested[5];
        if (start + limit > num)
            limit = num - start;
        if (start >= num)
            break;
    }
    for (const [uin, _] of this.fl) {
        if (!set.has(uin))
            this.fl.delete(uin);
    }
}
async function loadSL() {
    const body = core_1.pb.encode({
        1: 1,
        2: {
            1: this.sig.seq + 1
        }
    });
    const payload = await this.sendOidb("OidbSvc.0x5d2_0", body, 10);
    let protos = core_1.pb.decode(payload)[4][2][2];
    if (!protos)
        return;
    if (!Array.isArray(protos))
        protos = [protos];
    const set = new Set();
    for (const proto of protos) {
        this.sl.set(proto[1], {
            user_id: proto[1],
            nickname: String(proto[2]),
        });
        set.add(proto[1]);
    }
    for (const [uin, _] of this.sl) {
        if (!set.has(uin))
            this.sl.delete(uin);
    }
}
function loadGPL() {
    this.sendUni("trpc.group_pro.synclogic.SyncLogic.SyncFirstView", core_1.pb.encode({ 1: 0, 2: 0, 3: 0 })).then(payload => {
        this.tiny_id = String(core_1.pb.decode(payload)[6]);
    }).catch(common_1.NOOP);
    return new Promise((resolve, reject) => {
        const id = setTimeout(reject, 5000);
        this.on('internal.sso', (cmd, payload) => {
            if (cmd === 'trpc.group_pro.synclogic.SyncLogic.PushFirstView') {
                const proto = core_1.pb.decode(payload);
                if (proto[3]) {
                    if (!Array.isArray(proto[3]))
                        proto[3] = [proto[3]];
                    const tmp = new Set();
                    for (let p of proto[3]) {
                        const id = String(p[1]), name = String(p[4]);
                        tmp.add(id);
                        if (!this.guilds.has(id))
                            this.guilds.set(id, new guild_1.Guild(this, id));
                        const guild = this.guilds.get(id);
                        guild._renew(name, p[3]);
                    }
                    for (let [id, _] of this.guilds) {
                        if (!tmp.has(id))
                            this.guilds.delete(id);
                    }
                }
                clearTimeout(id);
                resolve();
            }
        });
    });
}
async function loadGL() {
    const GetTroopListReqV2Simplify = core_1.jce.encodeStruct([
        this.uin, 0, null, [], 1, 8, 0, 1, 1
    ]);
    const body = core_1.jce.encodeWrapper({ GetTroopListReqV2Simplify }, "mqq.IMService.FriendListServiceServantObj", "GetTroopListReqV2Simplify");
    const payload = await this.sendUni("friendlist.GetTroopListReqV2", body, 10);
    const nested = core_1.jce.decodeWrapper(payload);
    const set = new Set();
    for (let v of nested[5]) {
        const gid = v[1];
        const info = {
            group_id: gid,
            group_name: v[4] || "",
            member_count: v[19],
            max_member_count: v[29],
            owner_id: v[23],
            last_join_time: v[27],
            shutup_time_whole: v[9] ? 0xffffffff : 0,
            shutup_time_me: v[10] > (0, common_1.timestamp)() ? v[10] : 0,
            admin_flag: !!v[11],
            update_time: 0,
        };
        this.gl.set(gid, Object.assign(this.gl.get(gid) || {}, info));
        set.add(gid);
    }
    for (const [gid, _] of this.gl) {
        if (!set.has(gid)) {
            this.gl.delete(gid);
            this.gml.delete(gid);
        }
    }
}
async function loadBL() {
    let body = core_1.pb.encode({
        1: {
            1: this.uin,
            3: 0,
            4: 1000,
        }
    });
    let len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(body.length);
    body = Buffer.concat([Buffer.alloc(4), len, body]);
    const payload = await this.sendUni("SsoSnsSession.Cmd0x3_SubCmd0x1_FuncGetBlockList", body);
    let protos = core_1.pb.decode(payload.slice(8))[1][6];
    this.blacklist.clear();
    if (!protos)
        return;
    if (!Array.isArray(protos))
        protos = [protos];
    for (let proto of protos)
        this.blacklist.add(proto[1]);
}
class OcrResult {
    constructor(proto) {
        this.wordslist = [];
        this.language = proto[2]?.toString() || "unknown";
        if (!Array.isArray(proto[1]))
            proto[1] = [proto[1]];
        for (let p of proto[1]) {
            this.wordslist.push({
                words: p[1]?.toString() || "",
                confidence: Number(p[2]),
                polygon: p[3][1].map((v) => ({ x: Number(v[1]) || 0, y: Number(v[2]) || 0 })),
            });
        }
    }
    toString() {
        let str = "";
        for (const elem of this.wordslist)
            str += elem.words;
        return str;
    }
}
exports.OcrResult = OcrResult;
async function imageOcr(img) {
    await img.task;
    const url = String((await highway_1.highwayUpload.call(this, img.readable, {
        cmdid: highway_1.CmdID.Ocr,
        md5: img.md5,
        size: img.size,
        ext: core_1.pb.encode({
            1: 0,
            2: (0, common_1.uuid)(),
        })
    }))?.[2]);
    const body = core_1.pb.encode({
        1: 1,
        2: 0,
        3: 1,
        10: {
            1: url,
            10: img.md5.toString("hex"),
            11: img.md5.toString("hex"),
            12: img.size,
            13: img.width,
            14: img.height,
            15: 0,
        }
    });
    const payload = await this.sendOidb("OidbSvc.0xe07_0", body, 10);
    const rsp = core_1.pb.decode(payload);
    if (rsp[3] !== 0)
        (0, errors_1.drop)(rsp[3], rsp[5]);
    return new OcrResult(rsp[4][10]);
}
