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

// --- TalentOS // Studio (Freelance Client Pipeline) ---

export type LeadStatus = "matched" | "pitched" | "sent" | "replied" | "skipped" | "archived";

export type Lead = {
  lead_id: string;
  title: string;
  client: string;
  budget?: string;
  timeline?: string;
  url?: string;
  source?: string;
  posted_at?: string;
  status: string;
  match_strength?: "strong" | "medium" | "weak" | "unscored";
  reasoning?: string;
  missing_information?: string[];
  unmet_requirements?: string[];
  pitch_message?: string;
  relevant_portfolio?: string[];
  suggested_rate?: string;
  contact_method?: string;
  edited_pitch_message?: string;
  pitch_edited_at?: string;
  materials_created_at?: string;
  evaluated_at?: string;
};

export type LeadsResponse = {
  status: string;
  leads: Lead[];
};

export type FreelanceProfile = {
  freelance_niche: string;
  freelance_availability: string;
  freelance_services: string[];
  freelance_portfolio_summary: string;
};

// --- Pipeline run telemetry ---------------------------------------------------

export type RunSummary = {
  run_id?: string;
  recorded_at?: string;
  /** Raw postings pulled from every ATS and aggregator source. */
  fetched?: number;
  quick_added?: number;
  /** Postings this evaluator has not judged before. */
  unseen?: number;
  /** Survivors of the deterministic pre-filter. */
  relevant_after_prefilter?: number;
  taken_this_run?: number;
  deferred_to_next_run?: number;
  /** Drop counts keyed by rule, e.g. { title_not_in_target_titles: 48 }. */
  filtered_out?: Record<string, number>;
  selected_by_source?: Record<string, number>;
  source_errors?: Record<string, string>;
  cost_usd?: number;
  tokens?: number;
  models?: { evaluator?: string; drafter?: string };
};
