import { FaceElem } from "..";
/** 表情字典 */
export declare const facemap: {
    [key: number]: Omit<FaceElem, 'id' | 'type'>;
};
/** 戳一戳字典 */
export declare const pokemap: {
    [k: number]: string;
};
export declare const FACE_OLD_BUF: Buffer;
