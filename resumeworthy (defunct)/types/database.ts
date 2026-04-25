// types/database.ts

export type BlockType = 'experience' | 'education' | 'project' | 'skill' | 'summary';

export interface ResumeBlock {
  id?: string;
  user_id: string;
  type: BlockType;
  content: {
    title?: string;
    company?: string;
    location?: string;
    date_range?: string;
    description_bullets?: string[];
    skill_name?: string;
    proficiency?: string;
  };
  tags: string[];
  created_at?: string;
}