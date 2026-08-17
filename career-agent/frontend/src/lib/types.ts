export type JobStatus = "matched" | "applied" | "skipped";

export type JobPosting = {
  job_id: string;
  location?: string;
  remote?: boolean;
  url?: string;
  source?: string;
  posted_at?: string;
};

export type Job = {
  job_id: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  url?: string;
  source?: string;
  posted_at?: string;
  status: string;
  match_strength?: "strong" | "medium" | "weak" | "unscored";
  reasoning?: string;
  missing_information?: string[];
  unmet_requirements?: string[];
  cover_letter?: string;
  tailored_resume?: TailoredResume;
  cover_letter_edited_at?: string;
  tailored_resume_edited_at?: string;
  contact_email?: string;
  contact_confidence?: string;
  materials_created_at?: string;
  evaluated_at?: string;
  group_key?: string;
  posting_count?: number;
  postings?: JobPosting[];
};

export type ResumeEntry = {
  title: string;
  organization: string;
  dates: string;
  bullets: string[];
};

export type TailoredResume = {
  headline: string;
  summary: string;
  skills: string[];
  experience: ResumeEntry[];
  projects: ResumeEntry[];
  education: string[];
};

export type MaterialsResponse = {
  job_id: string;
  title: string;
  company: string;
  generated_cover_letter: string;
  edited_cover_letter: string | null;
  effective_cover_letter: string;
  cover_letter_edited_at: string | null;
  generated_tailored_resume: TailoredResume;
  edited_tailored_resume: TailoredResume | null;
  effective_tailored_resume: TailoredResume;
  tailored_resume_edited_at: string | null;
};

export type JobsResponse = {
  status: JobStatus;
  jobs: Job[];
};

export type WorkMode = "onsite" | "remote" | "both";

export type LocationPreference = {
  location: string;
  work_mode: WorkMode;
};

export type SearchPreferences = {
  target_titles: string[];
  location_preferences: LocationPreference[];
  needs_visa_sponsorship: boolean;
};
