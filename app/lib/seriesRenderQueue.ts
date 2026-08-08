export type SeriesRenderQueue={
  projectIds:string[];
  currentIndex:number;
  completedIds:string[];
  status:"running"|"stopped";
  updatedAt:string;
};

export function createSeriesRenderQueue(projectIds:string[]):SeriesRenderQueue{
  return {projectIds:[...new Set(projectIds.filter(Boolean))],currentIndex:0,completedIds:[],status:"running",updatedAt:new Date().toISOString()};
}

export function parseSeriesRenderQueue(raw:string|null):SeriesRenderQueue|null{
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as Partial<SeriesRenderQueue>;
    if(!Array.isArray(value.projectIds)||!value.projectIds.length||!value.projectIds.every((id)=>typeof id==="string"&&id.length>0))return null;
    const completedIds=Array.isArray(value.completedIds)?value.completedIds.filter((id):id is string=>typeof id==="string"&&value.projectIds!.includes(id)):[];
    const currentIndex=Math.max(0,Math.min(value.projectIds.length-1,Number.isInteger(value.currentIndex)?Number(value.currentIndex):completedIds.length));
    return {projectIds:[...new Set(value.projectIds)],currentIndex,completedIds:[...new Set(completedIds)],status:value.status==="stopped"?"stopped":"running",updatedAt:typeof value.updatedAt==="string"?value.updatedAt:new Date().toISOString()};
  }catch{return null;}
}

export function updateSeriesRenderQueue(queue:SeriesRenderQueue,patch:Partial<Pick<SeriesRenderQueue,"currentIndex"|"completedIds"|"status">>):SeriesRenderQueue{
  return {...queue,...patch,updatedAt:new Date().toISOString()};
}

export function completeSeriesRenderEpisode(queue:SeriesRenderQueue,projectId:string){
  const completedIds=[...new Set([...queue.completedIds,projectId])];
  const nextIndex=queue.projectIds.findIndex((id,index)=>index>queue.currentIndex&&!completedIds.includes(id));
  if(nextIndex<0)return {queue:updateSeriesRenderQueue(queue,{completedIds,currentIndex:queue.projectIds.length-1,status:"stopped"}),complete:true,nextProjectId:null};
  return {queue:updateSeriesRenderQueue(queue,{completedIds,currentIndex:nextIndex,status:"running"}),complete:false,nextProjectId:queue.projectIds[nextIndex]};
}
