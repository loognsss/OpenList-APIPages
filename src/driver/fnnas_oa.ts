import {Context} from "hono";
import * as local from "hono/cookie";
import * as configs from "../shares/configs";
import CryptoJS from "crypto-js";
import { v4 as uuidv4 } from "uuid";
import {getCookie, setCookie} from "../shares/cookies";
import {pubLogin} from "../shares/oauthv2";
import {pubParse} from "../shares/urlback";
import {pubRenew} from "../shares/refresh";
import {encodeCallbackData} from "../shares/secrets";

const driver_map: string[] = [
    "https://oauth.fnnas.com/api/v1/oauth/getAuthUrl",       // 获取授权页面
    "https://oauth.fnnas.com/api/v1/oauth/exchangeToken",    // 交换访问令牌
    "https://oauth.fnnas.com/api/v1/oauth/refreshToken"      // 刷新访问令牌
];

let driver_params_map: Map<string, Record<string, any>> = new Map<string, Record<string, any>>(
    [

        ["baiduyun_fn", {
            authType: 1,
            redirectUrlPath: "/baiduyun_fn/callback"
        }],
        ["alicloud_fn", {
            authType: 2,
            redirectUrlPath: "/alicloud_fn/callback"
        }],
        ["quarkyun_fn", {
            authType: 4,
            redirectUrlPath: "/quarkyun/callback"
        }],
        ["123cloud_fn", {
            authType: 5,
            redirectUrlPath: "/123cloud/callback"
        }]
    ]
);

const fN_Api_Sign_KEY = "Pn2u9sYpBC77RZtLcRxYoCm8DBQpuj";

// 登录申请 ##############################################################################
export async function getLogin(c: Context) {
    const clients: configs.Clients | undefined = configs.getInfo(c);
    if (!clients?.servers && !clients?.drivers) return c.json({text: "参数缺少"}, 500);
    if (!clients?.servers && !clients?.app_uid) return c.json({text: "参数缺少"}, 500);
    if (!driver_params_map.has(clients.drivers!)) return c.json({text: "不支持的网盘类型"}, 500);
    // 请求参数 ==========================================================================
    const params_all = {
        authType: driver_params_map.get(clients.drivers!)?.authType,
        grantType: "authorization_code",
        redirectUrlToFrontend: 'https://' + c.env.MAIN_URLS + driver_params_map.get(clients.drivers!)?.redirectUrlPath,
        trimAppId: "com.trim.cloudstorage"
    };

    setCookie(c, clients)

    const authxHeader = generateAuthxHeader(c,driver_map[0], params_all);

    const result_json = await pubLogin(c,
        JSON.stringify(params_all), driver_map[0], false, "POST", "json",
        {'Content-Type': 'application/json','authx':authxHeader});
    if (result_json.code !== 0)
        return c.json({text: result_json.msg || "获取授权URL失败"}, 500);
    if (!result_json.data || !result_json.data.authUrlWithNonce) {
        return c.json({text: "授权URL数据缺失"}, 500);
    }
    return c.json({text: result_json.data.authUrlWithNonce}, 200);
}

// 令牌申请 ##############################################################################
export async function urlParse(c: Context) {
    const clients_info: configs.Clients = getCookie(c);
    const logins_nonce = <string>c.req.query('nonce');
    if (!logins_nonce) return c.json({text: "Nonce缺少"}, 500);
    const params_info: Record<string, any> = {
        authType: driver_params_map.get(clients_info.drivers!)?.authType,
        nonce: logins_nonce,
        trimAppId: "com.trim.cloudstorage"
    };

    const authxHeader = generateAuthxHeader(c,driver_map[1], params_info);

    return await pubParse(c, clients_info,
        JSON.stringify(params_info), driver_map[1], "POST",
        "msg", "data.accessToken", "data.refreshToken",
        "", {'Content-Type': 'application/json','authx':authxHeader});
}

// 刷新令牌 ##############################################################################
export async function apiRenew(c: Context) {
    const refresh_text = <string>c.req.query('refresh_ui');
    const clients_info: configs.Clients | undefined = configs.getInfo(c);
    if (!clients_info) return c.json({text: "传入参数缺少"}, 500);
    if (!refresh_text) return c.json({text: "缺少刷新令牌"}, 500);
    if (!driver_params_map.has(clients_info.drivers!)) return c.json({text: "不支持的网盘类型"}, 500);
    const params_info: Record<string, any> = {
        authType: driver_params_map.get(clients_info.drivers!)?.authType,
        refreshToken: refresh_text,
        trimAppId: "com.trim.cloudstorage"
    };

    const authxHeader = generateAuthxHeader(c,driver_map[2], params_info);

    return await pubRenew(c, driver_map[2], JSON.stringify(params_info),
        "POST", "data.tokenInfo.accessToken",
        "data.tokenInfo.refreshToken", "msg",
        "", {'Content-Type': 'application/json','authx':authxHeader});
}

function generateAuthxHeader(
    c:Context,
    apiPath: string,
    bodyData: Record<string, any>,
    customNonce?: number,
    customTimestamp?: number
): string {

    // Parse the URL to extract the path
    const parsedPath = apiPath.substring(apiPath.indexOf("/", apiPath.indexOf("//") + 2));
    // Retrieve or generate AUTH_HEADER_NAME
    let AUTH_HEADER_NAME = local.getCookie(c, "fn_oauth_uuid") || "";
    if (!AUTH_HEADER_NAME) {
        AUTH_HEADER_NAME = uuidv4().toUpperCase();
        local.setCookie(c, "fn_oauth_uuid", AUTH_HEADER_NAME);
    }

    const nonce = customNonce ?? Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000;
    const timestamp = customTimestamp ?? Date.now();

    const requestContentMd5 = CryptoJS.MD5(bodyData).toString();

    const preSignString = `${fN_Api_Sign_KEY}_${parsedPath}_${nonce}_${timestamp}_${requestContentMd5}_${AUTH_HEADER_NAME}`;
    const sign = CryptoJS.MD5(preSignString).toString();

    return `nonce=${nonce}&timestamp=${timestamp}&sign=${sign}`;
}