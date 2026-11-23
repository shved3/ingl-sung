import {PublicClientApplication} from '@azure/msal-browser';
let app;
export async function connect({client,tenant}) {
  if(!app){
    app=new PublicClientApplication({auth:{clientId:client,authority:'https://login.microsoftonline.com/'+tenant,redirectUri:location.origin+'/microsoft-return.html'},cache:{cacheLocation:'memoryStorage'}});
    await app.initialize();
  }
  const result=await app.loginPopup({scopes:['Files.Read'],prompt:'select_account'});
  return result.accessToken;
}
