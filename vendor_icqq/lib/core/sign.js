"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sign_type = void 0;
exports.getT544 = getT544;
exports.getSign = getSign;
exports.requestSignToken = requestSignToken;
exports.submitSsoPacket = submitSsoPacket;
exports.getApiQQVer = getApiQQVer;
exports.getCmdWhiteList = getCmdWhiteList;
exports.apiPing = apiPing;
const axios_1 = __importDefault(require("axios"));
const base_client_1 = require("./base-client");
const constants_1 = require("./constants");
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const ws_1 = __importDefault(require("ws"));
exports.sign_type = "sign";
const axios = axios_1.default.create({
    httpAgent: new http_1.default.Agent({
        keepAlive: true,
        keepAliveMsecs: 60000
    }),
    httpsAgent: new https_1.default.Agent({
        keepAlive: true,
        keepAliveMsecs: 60000
    }),
    timeout: 20000,
    headers: {
        "Connection": "keep-alive"
    }
});
const ws = {
    seq: 1000,
    webSocket: null,
    map: new Map(),
    message: (data) => {
        try {
            data = JSON.parse(data.toString());
            ws.map.get(data.ws_seq)?.(data);
        }
        catch { }
    }
};
async function getT544(cmd) {
    let sign = constants_1.BUF0;
    if (this.sig.sign_api_addr && this.apk.qua) {
        const time = process.hrtime();
        let post_params = {
            ver: this.apk.ver,
            uin: this.uin || 0,
            data: cmd,
            guid: this.device.guid.toString("hex"),
            version: this.apk.sdkver
        };
        const data = await get.bind(this)("energy", post_params, true);
        const log = `getT544:${cmd} result(${(0, constants_1.hrtimeToMs)(process.hrtime(time))}ms):${JSON.stringify(data)}`;
        if (data.code === 0) {
            this.emit("internal.verbose", log, base_client_1.VerboseLevel.Debug);
            if (typeof (data.data) === "string") {
                sign = Buffer.from(data.data, "hex");
            }
            else if (typeof (data.data?.sign) === "string") {
                sign = Buffer.from(data.data.sign, "hex");
                if (typeof (data.data.t553) === "string")
                    this.sig.t553 = Buffer.from(data.data.t553, "hex");
            }
        }
        else {
            this.emit("internal.verbose", `签名api异常：${log}`, base_client_1.VerboseLevel.Error);
        }
    }
    return this.generateT544Packet(cmd, sign);
}
async function getSign(cmd, seq, body) {
    let params = constants_1.BUF0;
    if (!this.sig.sign_api_addr)
        return params;
    let qImei36 = this.device.qImei36 || this.device.qImei16;
    if (this.apk.qua) {
        const time = process.hrtime();
        let post_params = {
            ver: this.apk.ver,
            qua: this.apk.qua,
            uin: this.uin || 0,
            cmd: cmd,
            seq: seq,
            androidId: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            guid: this.device.guid.toString("hex"),
            buffer: body.toString("hex")
        };
        const data = await get.bind(this)("sign", post_params, true);
        const log = `sign:${cmd} seq:${seq} result(${(0, constants_1.hrtimeToMs)(process.hrtime(time))}ms):${JSON.stringify(data)}`;
        if (data.code === 0) {
            this.emit("internal.verbose", log, base_client_1.VerboseLevel.Debug);
            const Data = data.data || {};
            params = this.generateSignPacket(Data.sign, Data.token, Data.extra);
            let list = Data.ssoPacketList || Data.requestCallback || [];
            if (list.length > 0)
                this.ssoPacketListHandler(list);
        }
        else {
            this.emit("internal.verbose", `签名api异常：${log}`, base_client_1.VerboseLevel.Error);
        }
    }
    return params;
}
async function requestSignToken() {
    if (!this.sig.sign_api_addr)
        return [];
    let qImei36 = this.device.qImei36 || this.device.qImei16;
    if (this.apk.qua) {
        const time = process.hrtime();
        let post_params = {
            ver: this.apk.ver,
            qua: this.apk.qua,
            uin: this.uin || 0,
            androidId: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            guid: this.device.guid.toString("hex")
        };
        const data = await get.bind(this)("request_token", post_params, true);
        this.emit("internal.verbose", `requestSignToken result(${(0, constants_1.hrtimeToMs)(process.hrtime(time))}ms): ${JSON.stringify(data)}`, base_client_1.VerboseLevel.Debug);
        if (data.code === 0) {
            let ssoPacketList = data.data?.ssoPacketList || data.data?.requestCallback || data.data;
            if (!ssoPacketList || ssoPacketList.length < 1)
                return [];
            return ssoPacketList;
        }
    }
    return [];
}
async function submitSsoPacket(cmd, callbackId, body) {
    if (!this.sig.sign_api_addr)
        return [];
    let qImei36 = this.device.qImei36 || this.device.qImei16;
    if (this.apk.qua) {
        const time = process.hrtime();
        let post_params = {
            ver: this.apk.ver,
            qua: this.apk.qua,
            uin: this.uin || 0,
            cmd: cmd,
            callbackId: callbackId,
            androidId: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            buffer: body.toString("hex"),
            guid: this.device.guid.toString("hex")
        };
        const data = await get.bind(this)("submit", post_params, true);
        this.emit("internal.verbose", `submitSsoPacket result(${(0, constants_1.hrtimeToMs)(process.hrtime(time))}ms): ${JSON.stringify(data)}`, base_client_1.VerboseLevel.Debug);
        if (data.code === 0) {
            let ssoPacketList = data.data?.ssoPacketList || data.data?.requestCallback || data.data;
            if (!ssoPacketList || ssoPacketList.length < 1)
                return [];
            return ssoPacketList;
        }
    }
    return [];
}
async function getApiQQVer() {
    let QQVer = this.config.ver;
    if (!this.sig.sign_api_addr)
        return QQVer;
    const apks = this.getApkInfoList(this.config.platform);
    const packageName = this.apk.id;
    const data = await get.bind(this)("ver");
    if (data.code === 0) {
        const vers = data?.data[packageName];
        if (vers && vers.length > 0) {
            for (let ver of vers) {
                if (apks.find(val => val.ver === ver)) {
                    QQVer = ver;
                    break;
                }
            }
        }
    }
    return QQVer;
}
async function getCmdWhiteList() {
    let whiteList = [];
    if (!this.sig.sign_api_addr)
        return whiteList;
    const data = await get.bind(this)("cmd_whitelist", {
        ver: this.apk.ver,
        uin: this.uin || 0
    });
    if (data.code === 0) {
        whiteList = data?.data?.list || [];
    }
    return whiteList;
}
async function apiPing(pathname = "ping") {
    if (!this.sig.sign_api_addr)
        return false;
    const url = new URL(this.sig.sign_api_addr);
    url.pathname += pathname;
    const ret = await ws_get.bind(this)(pathname) || await axios.get(url.href, {
        headers: {
            "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
            "Content-Type": "application/x-www-form-urlencoded"
        }
    }).catch(err => ({ data: { code: -1, msg: err?.message } }));
    return ret?.data || { code: -1 };
}
async function get(path, params = {}, post = false) {
    const url = new URL(this.sig.sign_api_addr);
    if (url.pathname.includes('/ws'))
        url.pathname = url.pathname.substring(0, url.pathname.length - 3);
    url.pathname += path;
    let data = { code: -1 };
    let num = 0;
    while (data.code === -1 && num < 3) {
        if (num > 0)
            await new Promise((resolve) => setTimeout(resolve, 2000));
        num++;
        const ws_data = await ws_get.bind(this)(path, params);
        if (ws_data === null) {
            if (post) {
                data = await axios.post(url.href, params, {
                    headers: {
                        "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                }).catch(err => ({ data: { code: -1, msg: err?.message } }));
            }
            else {
                data = await axios.get(url.href, {
                    params, headers: {
                        "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                }).catch(err => ({ data: { code: -1, msg: err?.message } }));
            }
        }
        else {
            data = ws_data;
        }
        data = data.data || data;
    }
    return data;
}
async function ws_get(path, params = {}) {
    if (ws.seq < 1 || !(this.sig.sign_api_addr && this.sig.sign_api_addr.includes('/ws')))
        return null;
    const url = new URL(this.sig.sign_api_addr);
    try {
        return await new Promise(async (resolve, reject) => {
            if (!ws.webSocket || ws.webSocket.readyState > 1) {
                ws.webSocket = new ws_1.default(`${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}/ws`);
                ws.webSocket.on("error", (error) => {
                    reject(error);
                });
                ws.webSocket.on("ping", (data) => ws.webSocket?.pong(data));
                ws.webSocket.on("message", (data) => ws.message(data));
            }
            if (ws.webSocket.readyState === 0) {
                await new Promise(_resolve => {
                    const timer = setInterval(() => {
                        if (ws.webSocket?.readyState !== 0) {
                            clearInterval(timer);
                            _resolve("");
                        }
                    }, 1);
                });
            }
            const ws_seq = ++ws.seq;
            const id = setTimeout(() => {
                ws.map.delete(ws_seq);
                resolve({ data: { code: -1, msg: "api等待超时" } });
            }, 20000);
            params = { path: `/${path}`, ws_seq, ...params };
            ws.map.set(ws_seq, (data) => {
                clearTimeout(id);
                ws.map.delete(ws_seq);
                resolve({ data: data });
            });
            try {
                ws.webSocket?.send(new URLSearchParams(Object.entries(params)).toString());
            }
            catch (err) {
                resolve({ data: { code: -1, msg: err } });
            }
        });
    }
    catch {
        //ws.seq = -1;
        return null;
    }
}
