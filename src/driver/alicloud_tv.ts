import {Context} from "hono";
import * as refresh from "../shares/refresh";
import * as configs from "../shares/configs";

// 用于替代 Node.js 的 crypto.randomUUID
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// 定义API响应的接口
interface ApiResponse {
    code?: number;
    data?: Record<string, any>;
    t?: string;
    message?: string;
}

// 定义Token数据接口
interface TokenData {
    ciphertext: string;
    iv: string;
}

// 阿里云盘TV版token获取类
class AliyunPanTvToken {
    private timestamp: string;
    private uniqueId: string;
    private wifimac: string;
    private model: string;
    private brand: string;
    private akv: string;
    private apv: string;
    private headersBase: Record<string, string>;
    private initialized: boolean = false;

    constructor() {
        // 构造函数中只设置默认值，不执行异步操作
        // this.timestamp = Date.now().toString(); // 设置默认时间戳
        this.timestamp = ''
        this.uniqueId = generateUUID().replace(/-/g, '');
        this.wifimac = Math.floor(100000000000 + Math.random() * 900000000000).toString();
        // this.wifimac = "020000000000";
        this.model = "SM-S908E";
        this.brand = "samsung";
        this.akv = "2.6.1143";
        this.apv = "1.4.0.2";

        this.headersBase = {
            "User-Agent": "Mozilla/5.0 (Linux; U; Android 15; zh-cn; SM-S908E Build/UKQ1.231108.001) AppleWebKit/533.1 (KHTML, like Gecko) Mobile Safari/533.1",
            "Host": "api.extscreen.com",
            "Content-Type": "application/json;",
        };
    }

    // 懒加载初始化方法，在首次API调用时执行
    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return;

        try {
            const response = await fetch("http://api.extscreen.com/timestamp");
            const data = await response.json() as { data?: { timestamp?: number } };
            if (data?.data?.timestamp) {
                this.timestamp = data.data.timestamp.toString();
            }
        } catch (error) {
            console.error("获取时间戳错误:", error);
            // 保持默认时间戳
        } finally {
            this.initialized = true;
        }
    }

    // 精确匹配Python版本的h函数
    private h(charArray: string[], modifier: string): string {
        // 获取唯一字符，与Python的list(dict.fromkeys(char_array))等效
        const uniqueChars = Array.from(new Set(charArray));
        const modifierStr = String(modifier);
        // 与Python的substring逻辑完全一致
        const numericModifierStr = modifierStr.length > 7 ? modifierStr.substring(7) : '0';
        let numericModifier: number;

        try {
            numericModifier = parseInt(numericModifierStr, 10);
            if (isNaN(numericModifier)) numericModifier = 0;
        } catch {
            numericModifier = 0;
        }

        const modVal = numericModifier % 127;
        let transformedString = "";

        for (const c of uniqueChars) {
            const charCode = c.charCodeAt(0);
            let newCharCode = Math.abs(charCode - modVal - 1);

            if (newCharCode < 33) {
                newCharCode += 33;
            }

            try {
                transformedString += String.fromCharCode(newCharCode);
            } catch {
                // 跳过无效字符，与Python行为一致
            }
        }

        return transformedString;
    }

    private getParams(): Record<string, any> {
        return {
            "akv": this.akv,
            "apv": this.apv,
            "b": this.brand,
            "d": this.uniqueId,
            "m": this.model,
            "mac": "",
            "n": this.model,
            "t": this.timestamp,
            "wifiMac": this.wifimac,
        };
    }

    // 与Python版本完全匹配的MD5实现
    private async md5(str: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('MD5', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 与Python版本完全匹配的SHA-256实现
    private async sha256(str: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 精确匹配Python版本的generateKey实现
    private async generateKey(): Promise<string> {
        const params = this.getParams();
        const sortedKeys = Object.keys(params).sort();
        // 使用与Python完全相同的连接方式
        let concatenatedParams = "";
        for (const key of sortedKeys) {
            if (key !== 't') {
                concatenatedParams += String(params[key]);
            }
        }

        const keyArray = concatenatedParams.split('');
        const hashedKey = this.h(keyArray, this.timestamp);
        return await this.md5(hashedKey);
    }

    private async generateKeyWithT(t: string): Promise<string> {
        const params = this.getParams();
        params.t = t;
        const sortedKeys = Object.keys(params).sort();
        // 使用与Python完全相同的连接方式
        let concatenatedParams = "";
        for (const key of sortedKeys) {
            if (key !== 't') {
                concatenatedParams += String(params[key]);
            }
        }

        const keyArray = concatenatedParams.split('');
        const hashedKey = this.h(keyArray, t);
        return await this.md5(hashedKey);
    }

    // 与Python版本完全匹配的随机IV生成
    private randomIvStr(length: number = 16): string {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // 与Python版本完全匹配的加密实现
    private async encrypt(plainObj: any): Promise<{ iv: string, ciphertext: string }> {
        // 1. 生成密钥 - 与Python完全一致
        const key = await this.generateKey();

        // 2. 生成随机IV - 与Python完全一致
        const ivStr = this.randomIvStr(16);

        // 3. 准备加密数据 - 确保使用与Python相同的JSON序列化格式
        // Python: json.dumps(plain_obj, separators=(',', ':'))
        const plaintext = JSON.stringify(plainObj).replace(/\s/g, '');

        // 4. 创建UTF-8编码的数据
        const encoder = new TextEncoder();
        const keyBytes = encoder.encode(key);
        const ivBytes = encoder.encode(ivStr);
        const plaintextBytes = encoder.encode(plaintext);

        // 6. 使用Web Crypto API进行AES-CBC加密
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-CBC', length: 128 },
            false,
            ['encrypt']
        );

        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: 'AES-CBC', iv: ivBytes },
            cryptoKey,
            plaintextBytes
        );

        // 7. 转换为Base64编码 - 与Python的base64.b64encode(ciphertext).decode("utf-8")一致
        const encryptedArray = new Uint8Array(encryptedBuffer);
        let binary = '';
        for (let i = 0; i < encryptedArray.length; i++) {
            binary += String.fromCharCode(encryptedArray[i]);
        }
        const base64Ciphertext = btoa(binary);

        // 8. 返回与Python一致的结构
        return {
            iv: ivStr,
            ciphertext: base64Ciphertext
        };
    }

    // 与Python版本完全匹配的解密实现
    private async decrypt(ciphertext: string, iv: string, t?: string): Promise<string> {
        try {
            // 1. 生成密钥 - 与Python一致
            const key = t ? await this.generateKeyWithT(t) : await this.generateKey();

            // 2. 解码Base64密文 - 与Python一致
            const binaryString = atob(ciphertext);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // 3. 解码十六进制IV - 与Python中的bytes.fromhex(iv)一致
            const ivBytes = new Uint8Array(iv.length / 2);
            for (let i = 0; i < iv.length; i += 2) {
                ivBytes[i / 2] = parseInt(iv.substring(i, i + 2), 16);
            }

            // 4. 导入密钥
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(key),
                { name: 'AES-CBC', length: 256 },
                false,
                ['decrypt']
            );

            // 5. 解密
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv: ivBytes },
                cryptoKey,
                bytes
            );

            // 7. 转换为字符串
            return new TextDecoder().decode(decryptedBuffer);
        } catch (error) {
            console.error("解密失败:", error);
            throw error;
        }
    }

    private getHeaders(sign: string): Record<string, string> {
        const params = this.getParams();
        return {
            ...this.headersBase,
            "akv": this.akv,
            "apv": this.apv,
            "b": this.brand,
            "d": this.uniqueId,
            "m": this.model,
            "n": this.model,
            "t": this.timestamp,
            "wifiMac": this.wifimac,
            "sign": sign,
        };
    }

    // 与Python版本完全匹配的计算sign实现
    private async computeSign(method: string, apiPath: string): Promise<string> {
        const apiPathAdjusted = "/api" + apiPath;
        const key = await this.generateKey();
        const content = `${method}-${apiPathAdjusted}-${this.timestamp}-${this.uniqueId}-${key}`;
        return await this.sha256(content);
    }

    public async getToken(refreshToken: string): Promise<string> {
        // 确保已初始化
        await this.ensureInitialized();

        try {
            const bodyObj = { refresh_token: refreshToken };
            const encrypted = await this.encrypt(bodyObj);
            const reqBody = {
                iv: encrypted.iv,
                ciphertext: encrypted.ciphertext
            };

            console.log("[*] (Sign) Request Body:", JSON.stringify(reqBody));

            const sign = await this.computeSign("POST", "/v4/token");
            const headers = this.getHeaders(sign);

            const response = await fetch(
                "https://api.extscreen.com/aliyundrive/v4/token",
                {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(reqBody)
                }
            );

            console.log("[*] (Sign) Response Status:", response.status);
            const responseData = await response.json() as ApiResponse;
            console.log("[*] (Sign) Response Body:", responseData);

            // 类型安全检查
            if (!responseData) {
                throw new Error("Invalid response data");
            }

            // 检查响应数据中是否有code字段
            if (responseData.code !== undefined && responseData.code !== 200) {
                throw new Error(JSON.stringify(responseData));
            }

            // 类型安全地访问data字段
            if (!responseData.data) {
                throw new Error("Response missing data field");
            }

            const tokenData = responseData.data as TokenData;
            const t = responseData.t ? responseData.t.toString() : this.timestamp;

            if (!tokenData.ciphertext || !tokenData.iv) {
                throw new Error("Token data missing required fields");
            }

            return await this.decrypt(tokenData.ciphertext, tokenData.iv, t);
        } catch (error) {
            console.error("获取Token错误:", error);
            throw error;
        }
    }

    public async getRefreshtoken(authToken: string): Promise<string> {
        // 确保已初始化
        await this.ensureInitialized();

        try {
            const bodyObj = { code: authToken };
            const encrypted = await this.encrypt(bodyObj);
            const reqBody = {
                iv: encrypted.iv,
                ciphertext: encrypted.ciphertext
            };

            console.log("[*] (Sign) Request Body:", JSON.stringify(reqBody));

            const sign = await this.computeSign("POST", "/v4/token");
            const headers = this.getHeaders(sign);

            console.log("[*] (Sign) Headers:", headers);

            const response = await fetch(
                "https://api.extscreen.com/aliyundrive/v4/token",
                {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(reqBody)
                }
            );

            console.log("[*] (Sign) Response Status:", response.status);
            const responseData = await response.json() as ApiResponse;
            console.log("[*] (Sign) Response Body:", responseData);

            // 类型安全检查
            if (!responseData) {
                throw new Error("Invalid response data");
            }

            // 检查响应数据中是否有code字段
            if (responseData.code !== undefined && responseData.code !== 200) {
                throw new Error(JSON.stringify(responseData));
            }

            // 类型安全地访问data字段
            if (!responseData.data) {
                throw new Error("Response missing data field");
            }

            const tokenData = responseData.data as TokenData;
            const t = responseData.t ? responseData.t.toString() : this.timestamp;

            if (!tokenData.ciphertext || !tokenData.iv) {
                throw new Error("Token data missing required fields");
            }

            return await this.decrypt(tokenData.ciphertext, tokenData.iv, t);
        } catch (error) {
            console.error("获取RefreshToken错误:", error);
            throw error;
        }
    }

    public async getQrcodeUrl(): Promise<{ qr_link: string, sid: string }> {
        // 确保已初始化
        await this.ensureInitialized();

        try {
            // 使用与Python代码完全一致的参数结构
            const bodyObj = {
                scopes: ["user:base", "file:all:read", "file:all:write"].join(","),
                width: 500,
                height: 500
            };

            const encrypted = await this.encrypt(bodyObj);
            const reqBody = {
                iv: encrypted.iv,
                ciphertext: encrypted.ciphertext
            };

            console.log("[*] (Qrcode) Request Body:", JSON.stringify(reqBody));

            const sign = await this.computeSign("POST", "/v2/qrcode");
            const headers = this.getHeaders(sign);

            const response = await fetch(
                "https://api.extscreen.com/aliyundrive/v2/qrcode",
                {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(reqBody)
                }
            );

            console.log("[*] (Qrcode) Response Status:", response.status);
            const responseData = await response.json() as ApiResponse;
            console.log("[*] (Qrcode) Response Body:", responseData);

            // 类型安全检查
            if (!responseData) {
                throw new Error("Invalid response data");
            }

            // 检查响应数据中是否有code字段
            if (responseData.code !== undefined && responseData.code !== 200) {
                throw new Error(JSON.stringify(responseData));
            }

            // 类型安全地访问data字段
            if (!responseData.data) {
                throw new Error("Response missing data field");
            }

            const qrcodeData = responseData.data as TokenData;
            const t = responseData.t ? responseData.t.toString() : this.timestamp;

            if (!qrcodeData.ciphertext || !qrcodeData.iv) {
                throw new Error("QR code data missing required fields");
            }

            const decryptedData = await this.decrypt(qrcodeData.ciphertext, qrcodeData.iv, t);
            const data = JSON.parse(decryptedData) as { sid?: string };
            console.log("[*] (Qrcode) Decrypted Data:", data);

            if (!data.sid) {
                throw new Error("Missing sid in decrypted data");
            }

            const qrLink = "https://www.aliyundrive.com/o/oauth/authorize?sid=" + data.sid;
            return { qr_link: qrLink, sid: data.sid };
        } catch (error) {
            console.error("获取二维码错误:", error);
            throw error;
        }
    }
}

// 延迟创建实例 - 不在全局作用域中执行
let clientInstance: AliyunPanTvToken | null = null;

// 获取客户端实例的函数
function getClient(): AliyunPanTvToken {
    if (!clientInstance) {
        clientInstance = new AliyunPanTvToken();
    }
    return clientInstance;
}


// 导出的接口函数保持不变
export async function getQRCode(c: Context) {
    try {
        const client = getClient();
        const qrData = await client.getQrcodeUrl();
        return c.json({ text: qrData.qr_link, sid: qrData.sid });
    } catch (error) {
        console.error("获取二维码失败:", error);
        return c.json({ text: "获取二维码失败" }, 500);
    }
}

export async function checkStatus(c: Context) {
    try {
        const sid = c.req.query('sid');
        if (!sid) {
            return c.json({ text: "缺少sid参数" }, 400);
        }

        const status = await checkQrcodeStatus(sid);
        if (status) {
            return c.json(status);
        }

        return c.json({ text: "等待扫码" }, 202);
    } catch (error) {
        console.error("检查状态失败:", error);
        return c.json({ text: "检查状态失败" }, 500);
    }
}

async function checkQrcodeStatus(sid: string): Promise<{ auth_code: string } | null> {
    try {
        const response = await fetch(
            `https://openapi.alipan.com/oauth/qrcode/${sid}/status`
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json() as { status?: string; authCode?: string };
        if (data && data.status === "LoginSuccess" && data.authCode) {
            return { auth_code: data.authCode };
        }

        return null;
    } catch (error) {
        console.error("检查二维码状态错误:", error);
        throw error;
    }
}

export async function getTokenByAuthCode(c: Context) {
    try {
        const authCode = c.req.query('auth_code');
        if (!authCode) {
            return c.json({ text: "缺少auth_code参数" }, 400);
        }

        const client = getClient();
        const tokenData = await client.getRefreshtoken(authCode);
        return c.json(JSON.parse(tokenData));
    } catch (error) {
        console.error("获取Token失败:", error);
        return c.json({ text: "获取Token失败" }, 500);
    }
}

export async function refreshToken(c: Context) {
    try {
        const refreshToken = c.req.query('refresh_ui');
        if (!refreshToken) {
            return c.json({ text: "缺少refresh_token参数" }, 400);
        }

        const client = getClient();
        const tokenData = await client.getToken(refreshToken);
        return c.json(JSON.parse(tokenData));
    } catch (error) {
        console.error("刷新Token失败:", error);
        return c.json({ text: "刷新Token失败" }, 500);
    }
}