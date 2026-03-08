import {createFnosDriver} from './fnos_oa';

const driver = createFnosDriver({
    authType: 5,
    callbackPath: '/123cloud2/callback'
});

export const getLogin = driver.getLogin;
export const urlParse = driver.urlParse;
export const apiRenew = driver.apiRenew;
