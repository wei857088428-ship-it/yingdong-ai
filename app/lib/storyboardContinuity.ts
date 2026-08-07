type ContinuityShot = { scene?: string; action?: string; dialogue?: string; speaker_name?: string; character_names?: string[] | null; continuity_state?: string; image_prompt?: string; video_prompt?: string };

function names(values?: string[] | null) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))].slice(0, 6);
}

function ledger(shot?: ContinuityShot) {
  if (!shot) return "";
  const explicit = String(shot.continuity_state ?? "").trim();
  if (explicit) return explicit;
  const prompt = `${String(shot.image_prompt ?? "")}\n${String(shot.video_prompt ?? "")}`;
  return prompt.match(/\[CONTINUITY STATE\]\s*\n?([^\n]+)/i)?.[1]?.trim() ?? "";
}

export function continuityContract(current: ContinuityShot, previous?: ContinuityShot, next?: ContinuityShot) {
  const cast = names(current.character_names).join("、") || "无具名角色";
  const previousState = previous
    ? `上一镜场景：${previous.scene ?? ""}；上一镜结束动作：${previous.action ?? ""}；上一镜人物：${names(previous.character_names).join("、") || "无具名角色"}。`
    : "这是本集第一镜，必须明确建立人物位置、服装、随身道具、光线方向与环境布局。";
  const transition = previous && String(previous.scene ?? "").trim() !== String(current.scene ?? "").trim()
    ? "本镜发生场景变化，画面必须用可见的进入、离开、移动过程或明确建立镜头交代转换，禁止人物无解释瞬移。"
    : "本镜延续同一场景，严格保持人物左右站位、朝向、服装、伤势、手持道具、环境布局、光线方向和时间状态；仅改变剧情要求的动作与表情。";
  const nextState = next
    ? `本镜结尾必须形成可被下一镜直接承接的明确状态；下一镜场景：${next.scene ?? ""}；下一镜动作：${next.action ?? ""}。`
    : "本镜结尾必须停在清晰、可识别的悬念状态，不得在镜外自行完成后续事件。";
  return `\n\n[逐镜连续性契约]\n当前画面人物：${cast}。${previousState}${transition}${nextState} 人物身份、脸、发型、体型与服装不得改变；不得增加未列出的主要人物、道具、动作或剧情结果。`;
}

export function withContinuityPrompt(prompt: string, current: ContinuityShot, previous: ContinuityShot | undefined, next: ContinuityShot | undefined, mode: "image" | "video") {
  const base = String(prompt ?? "").split(/\n\n\[逐镜连续性契约\]/u)[0].trim();
  const currentLedger = ledger(current); const previousLedger = ledger(previous); const nextLedger = ledger(next);
  const ledgerContract = `\n状态账本：上一镜结束=${previousLedger || "无"}；本镜结束=${currentLedger || "必须按画面明确建立"}；下一镜目标=${nextLedger || "无"}。未被本镜可见事件改变的状态必须逐项继承。`;
  const contract = `${continuityContract(current, previous, next)}${ledgerContract}`;
  const hasDialogue = Boolean(String(current.dialogue ?? "").trim());
  const speaker = String(current.speaker_name ?? "").trim() || "唯一说话角色";
  const dialogueFraming = hasDialogue
    ? `\n[对白构图]\n${speaker}的正脸或四分之三侧脸清晰可见，嘴唇和下巴无遮挡、不过暗、不出画；其他人物保持闭嘴，不做说话口型。`
    : "";
  if (mode === "image") return `${base}${contract}${dialogueFraming}`;
  const lipSyncContract = hasDialogue
    ? `\n[口型同步准备]\n本镜只有${speaker}说话；说话期间保持其完整脸部和嘴部持续清晰可见，头部转动幅度小，不遮嘴、不背对镜头、不切镜；其他人物全程闭嘴且不做说话口型。开头和结尾各保留短暂稳定表情与自然闭嘴姿势。`
    : "";
  return `${base}${contract}${dialogueFraming}${lipSyncContract}\n视频动作必须从本镜静帧的初始姿势自然开始，只完成“${String(current.action ?? "")}”，并在下一镜可承接的姿势上结束；保持动作速度符合镜头时长，禁止中途跳切、瞬移、变脸、换装和无关动作。`;
}
