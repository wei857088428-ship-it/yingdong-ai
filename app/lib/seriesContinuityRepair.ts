import { continuityLedger } from "./storyboardContinuity";

type ContinuityRepairShot={shot_number:number;image_prompt?:string;video_prompt?:string;scene?:string;action?:string;character_names?:string[]|null;image_url?:string;video_url?:string};
type ContinuityRepairProject={id:string;parent_project_id?:string|null;storyboard_shots:ContinuityRepairShot[]};

export function hasCrossEpisodeLedger(parent:ContinuityRepairProject|undefined,child:ContinuityRepairProject){
  if(!parent||!child.parent_project_id||child.parent_project_id!==parent.id)return false;
  const previous=parent.storyboard_shots.toSorted((left,right)=>right.shot_number-left.shot_number)[0];const first=child.storyboard_shots.toSorted((left,right)=>left.shot_number-right.shot_number)[0];const ledger=continuityLedger(previous);
  return !ledger||Boolean(first&&`${first.image_prompt||""}\n${first.video_prompt||""}`.includes(`上一镜结束=${ledger}`));
}

export function projectsNeedingContinuityRepair<T extends ContinuityRepairProject>(projects:T[]){
  const byId=new Map(projects.map((project)=>[project.id,project]));
  return projects.filter((project)=>project.parent_project_id&&!hasCrossEpisodeLedger(byId.get(project.parent_project_id),project));
}
