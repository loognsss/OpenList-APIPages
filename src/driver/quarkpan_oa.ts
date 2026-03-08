import {createFnosDriver} from './fnos_oa';

const driver = createFnosDriver({
    authType: 4,
    callbackPath: '/quarkyun/callback'
});

export const getLogin = driver.getLogin;
export const urlParse = driver.urlParse;
export const apiRenew = driver.apiRenew;
