import {createAuthHandler} from '../../server/google-redirect.mjs';
export default {fetch:createAuthHandler('session')};
