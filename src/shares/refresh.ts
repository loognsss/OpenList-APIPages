// 登录申请 ##############################################################################
import {Context} from "hono";
import {getDynamicValue} from './findvar'
import {Requests} from "./request";

export async function pubRenew(c: Context,
                               APIUrl: string,
                               Params: Record<string, string> | string,
                               Method: string = "GET",
                               access_name: string = "access_token",
                               refresh_name: string = "refresh_token",
                               error_name: string = "error_description",
                               Finder: string = "json",
                               Header: Record<string, string> | undefined = undefined,
): Promise<any> {
    try {
        const result_json: Record<string, any> = await Requests(
            c, Params, APIUrl, Method, false, Header, "json")
        const origin_refresh_token = typeof Params === "object" && Params !== null ? Params['refresh_token'] : "";
        const refresh_token = getDynamicValue(result_json, refresh_name, origin_refresh_token)
        const access_token = getDynamicValue(result_json, access_name, "")
        if (refresh_token)
            return c.json({
                refresh_token: refresh_token,
                access_token: access_token,
            }, 200);
        return c.json({text: result_json[error_name]}, 500);
    } catch (error) {
        return c.json({text: error}, 500);
    }
}

