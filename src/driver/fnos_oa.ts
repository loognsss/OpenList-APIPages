import {Context} from "hono";
import * as configs from "../shares/configs";
import {getCookie, setCookie} from "../shares/cookies";
import {pubLogin} from "../shares/oauthv2";
import {pubParse} from "../shares/urlback";
import {pubRenew} from "../shares/refresh";

const FNOS_API = {
    getAuthUrl: "https://oauth.fnnas.com/api/v1/oauth/getAuthUrl",
    exchangeToken: "https://oauth.fnnas.com/api/v1/oauth/exchangeToken",
    refreshToken: "https://oauth.fnnas.com/api/v1/oauth/refreshToken"
} as const;

const TRIM_APP_ID = "com.trim.cloudstorage";

export interface FnosDriverConfig {
    authType: number;
    callbackPath: string;
}

export interface FnosDriver {
    getLogin: (c: Context) => Promise<Response>;
    urlParse: (c: Context) => Promise<Response>;
    apiRenew: (c: Context) => Promise<Response>;
}

export function createFnosDriver(config: FnosDriverConfig): FnosDriver {
    const {authType, callbackPath} = config;

    const getLogin = async (c: Context): Promise<Response> => {
        const clients: configs.Clients | undefined = configs.getInfo(c);
        if (!clients?.servers && !clients?.drivers) return c.json({text: "参数缺少"}, 500);
        if (!clients?.servers && !clients?.app_uid) return c.json({text: "参数缺少"}, 500);

        const params = {
            authType,
            grantType: "authorization_code",
            redirectUrlToFrontend: `https://${c.env.MAIN_URLS}${callbackPath}`,
            trimAppId: TRIM_APP_ID
        };

        setCookie(c, clients);
        const result = await pubLogin(
            c,
            JSON.stringify(params),
            FNOS_API.getAuthUrl,
            false,
            "POST",
            "json",
            {'Content-Type': 'application/json'}
        );

        if (result.code !== 0) {
            return c.json({text: result.msg || "获取授权URL失败"}, 500);
        }
        if (!result.data?.authUrlWithNonce) {
            return c.json({text: "授权URL数据缺失"}, 500);
        }

        return c.json({text: result.data.authUrlWithNonce}, 200);
    };

    const urlParse = async (c: Context): Promise<Response> => {
        const clientsInfo: configs.Clients = getCookie(c);
        const nonce: string | undefined = c.req.query('nonce');
        if (!nonce) return c.json({text: "Nonce缺少"}, 500);

        const params = {
            authType,
            nonce,
            trimAppId: TRIM_APP_ID
        };

        return await pubParse(
            c,
            clientsInfo,
            JSON.stringify(params),
            FNOS_API.exchangeToken,
            "POST",
            "msg",
            "data.accessToken",
            "data.refreshToken",
            "",
            {'Content-Type': 'application/json'}
        );
    };

    const apiRenew = async (c: Context): Promise<Response> => {
        const refreshToken: string | undefined = c.req.query('refresh_ui');
        const clientsInfo: configs.Clients | undefined = configs.getInfo(c);
        if (!clientsInfo) return c.json({text: "传入参数缺少"}, 500);
        if (!refreshToken) return c.json({text: "缺少刷新令牌"}, 500);

        const params = {
            authType,
            refreshToken,
            trimAppId: TRIM_APP_ID
        };

        return await pubRenew(
            c,
            FNOS_API.refreshToken,
            JSON.stringify(params),
            "POST",
            "data.tokenInfo.accessToken",
            "data.tokenInfo.refreshToken",
            "msg",
            "",
            {'Content-Type': 'application/json'}
        );
    };

    return {getLogin, urlParse, apiRenew};
}
