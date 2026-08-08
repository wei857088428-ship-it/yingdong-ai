export type VideoPollDecision="continue"|"retry"|"completed"|"failed"|"error";

export function videoPollDecision(httpStatus:number,taskStatus:string,consecutiveFailures:number):VideoPollDecision{
  const normalized=taskStatus.trim().toLowerCase();
  if(httpStatus>=200&&httpStatus<300){
    if(["done","completed","complete","success"].includes(normalized))return "completed";
    if(["failed","error","expired","canceled","cancelled"].includes(normalized))return "failed";
    return "continue";
  }
  const transient=httpStatus===0||httpStatus===408||httpStatus===425||httpStatus===429||httpStatus>=500;
  if(transient&&consecutiveFailures<=6)return "retry";
  return "error";
}
