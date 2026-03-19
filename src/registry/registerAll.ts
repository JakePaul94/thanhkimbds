import { registry }             from "./SkillRegistry";

// Content skills
import { IdeaSkill }            from "../skills/content/IdeaSkill";
import { ResearchSkill }        from "../skills/content/ResearchSkill";
import { WriterSkill }          from "../skills/content/WriterSkill";
import { ChatSkill }            from "../skills/content/ChatSkill";
import { AgentChatSkill }       from "../skills/content/AgentChatSkill";

// Media skills
import { ImageGenSkill }        from "../skills/media/ImageGenSkill";
import { VideoGenSkill }        from "../skills/media/VideoGenSkill";
import { VideoLocalSkill }      from "../skills/media/VideoLocalSkill";

// Social skills
import { FacebookPostSkill }    from "../skills/social/FacebookPostSkill";
import { ZaloPostSkill }        from "../skills/social/ZaloPostSkill";

// Memory skills
import { MemorySearchSkill }    from "../skills/memory/MemorySearchSkill";
import { MemorySaveSkill }      from "../skills/memory/MemorySaveSkill";

export function registerAllSkills() {
  registry.register(new IdeaSkill());
  registry.register(new ResearchSkill());
  registry.register(new WriterSkill());
  registry.register(new ChatSkill());
  registry.register(new AgentChatSkill());
  registry.register(new ImageGenSkill());
  registry.register(new VideoGenSkill());
  registry.register(new VideoLocalSkill());
  registry.register(new FacebookPostSkill());
  registry.register(new ZaloPostSkill());
  registry.register(new MemorySearchSkill());
  registry.register(new MemorySaveSkill());
}
