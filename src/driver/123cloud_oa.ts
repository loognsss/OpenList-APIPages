import * as local from "hono/cookie";
import {Context} from "hono";
import {setCookie} from "../shares/cookies";
import {pubLogin} from "../shares/oauthv2";
import * as configs from "../shares/configs";
import * as fnnas from "./fnnas_oa";


const driver_map: string[] = [
    "https://open-api.123pan.com/api/v1/access_token",
    "https://open-api.123pan.com/api/v1/access_token"
]

// 登录申请 ##############################################################################
export async function oneLogin(c: Context) {
    const clients_info: configs.Clients | undefined = configs.getInfo(c);
    if (!clients_info) return c.json({text: "传入参数缺少"}, 500);
    if (clients_info.drivers == "123cloud_fn") return await fnnas.getLogin(c);
    const params_info: Record<string, any> = {
        client_id: clients_info.app_uid,
        clientSecret: clients_info.app_uid,
    };
    if (!clients_info.servers)
        setCookie(c, clients_info)
    return await pubLogin(c, params_info, driver_map[0], true);


    // const client_uid: string = <string>c.req.query('client_uid');
    // const client_key: string = <string>c.req.query('client_key');
    // const driver_txt: string = <string>c.req.query('driver_txt');
    // const server_use: string = <string>c.req.query('server_use');
    // if (server_use == "false" && (!driver_txt || !client_uid || !client_key))
    //     return c.json({text: "参数缺少"}, 500);
    // // 请求参数 ==========================================================================
    // const params_all: Record<string, any> = {
    //
    // };
    // // 执行请求 ===========================================================================
    // try {
    //     const paramsString = new URLSearchParams(params_all).toString();
    //     const response: Response = await fetch(driver_map[0], {
    //         method: 'POST', body: paramsString,
    //         headers: {
    //             'Platform': "open_platform",
    //             'Content-Type': 'application/x-www-form-urlencoded'
    //         },
    //     });
    //     const json: Record<string, any> = await response.json();
    //     local.setCookie(c, 'driver_txt', driver_txt);
    //     return c.json({text: json.data.accessToken}, 200);
    // } catch (error) {
    //     return c.json({text: error}, 500);
    // }
}

// 令牌申请 ##############################################################################
export async function oneToken(c: Context) {
    return await fnnas.urlParse(c);
    // const clients_info: configs.Clients | undefined = configs.getInfo(c);
    // if (!clients_info) return c.json({text: "传入参数缺少"}, 500);
    // if (clients_info.drivers == "123cloud_fn") return await fnnas.urlParse(c);
    // return await oneLogin(c);
}

// 刷新令牌 ##############################################################################
export async function genToken(c: Context) {
    return await fnnas.apiRenew(c);
    // const clients_info: configs.Clients | undefined = configs.getInfo(c);
    // if (!clients_info) return c.json({text: "传入参数缺少"}, 500);
    // if (clients_info.drivers == "123cloud_fn") return await fnnas.apiRenew(c);
    // return c.json({text: "此网盘不支持"}, 500);
}
