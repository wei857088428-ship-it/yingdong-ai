type BindingShot={id:string;shot_number:number;dialogue?:string;character_ids?:string[]|null;character_names?:string[]|null;speaker_character_id?:string|null;voice_id?:string;image_url?:string;video_url?:string;audio_url?:string;media_status?:string};
type BindingProject={id:string;character_id?:string;storyboard_shots:BindingShot[]};
type BindingCharacter={id:string;name:string;voice_id?:string};
export type SeriesBindingChange={projectId:string;shotId:string;shotNumber:number;characterIds?:string[];speakerCharacterId?:string;repairsCharacterIds:boolean;repairsSpeaker:boolean;repairsVoice:boolean;invalidatesVisual:boolean;invalidatesAudio:boolean};

const normalize=(value:string)=>value.trim().toLocaleLowerCase("zh-CN").replace(/[\s·・._-]+/g,"");
const sameIds=(left:string[]|null|undefined,right:string[])=>[...new Set(left??[])].toSorted().join("|")===right.toSorted().join("|");

export function planSeriesBindings(projects:BindingProject[],characters:BindingCharacter[]){
  const byId=new Map(characters.map((character)=>[character.id,character]));const byName=new Map(characters.map((character)=>[normalize(character.name),character]));const changes:SeriesBindingChange[]=[];const missingCharacters=new Set<string>();let unresolvedSpeakers=0;
  for(const project of projects)for(const shot of project.storyboard_shots){
    const named=(shot.character_names??[]).map((name)=>{const character=byName.get(normalize(name));if(!character&&name.trim())missingCharacters.add(name.trim());return character;}).filter((character):character is BindingCharacter=>Boolean(character));
    const desiredIds=[...new Set(named.map((character)=>character.id))];if(!desiredIds.length&&project.character_id&&byId.has(project.character_id))desiredIds.push(project.character_id);
    const repairsCharacterIds=desiredIds.length>0&&!sameIds(shot.character_ids,desiredIds);
    let desiredSpeaker=shot.speaker_character_id||"";if(shot.dialogue?.trim()&&!desiredSpeaker){const label=shot.dialogue.match(/^\s*([\p{L}\p{N}_·]{1,20})\s*[：:]/u)?.[1];const labeled=label?byName.get(normalize(label)):undefined;desiredSpeaker=labeled?.id||(named.length===1?named[0].id:"");if(!desiredSpeaker)unresolvedSpeakers++;}
    const speaker=desiredSpeaker?byId.get(desiredSpeaker):undefined;const repairsSpeaker=Boolean(desiredSpeaker&&desiredSpeaker!==shot.speaker_character_id);const repairsVoice=Boolean(speaker?.voice_id&&shot.voice_id&&speaker.voice_id!==shot.voice_id);
    if(repairsCharacterIds||repairsSpeaker||repairsVoice)changes.push({projectId:project.id,shotId:shot.id,shotNumber:shot.shot_number,characterIds:repairsCharacterIds?desiredIds:undefined,speakerCharacterId:repairsSpeaker||repairsVoice?desiredSpeaker:undefined,repairsCharacterIds,repairsSpeaker,repairsVoice,invalidatesVisual:repairsCharacterIds&&Boolean(shot.image_url||shot.video_url),invalidatesAudio:(repairsSpeaker||repairsVoice)&&Boolean(shot.audio_url),});
  }
  return {changes,missingCharacters:[...missingCharacters],unresolvedSpeakers,visualInvalidations:changes.filter((change)=>change.invalidatesVisual).length,audioInvalidations:changes.filter((change)=>change.invalidatesAudio).length,voiceRepairs:changes.filter((change)=>change.repairsVoice).length,speakerRepairs:changes.filter((change)=>change.repairsSpeaker).length,castRepairs:changes.filter((change)=>change.repairsCharacterIds).length};
}
