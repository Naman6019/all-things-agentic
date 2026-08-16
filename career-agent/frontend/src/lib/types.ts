export type JobStatus = "matched" | "applied" | "skipped";

export type Job = {
  job_id: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  url?: string;
  source?: string;
  status: string;
  reasoning?: string;
  missing_information?: string[];
  unmet_requirements?: string[];
  cover_letter?: string;
  contact_email?: string;
  contact_confidence?: string;
  materials_created_at?: string;
  evaluated_at?: string;
};

export type JobsResponse = {
  status: JobStatus;
  jobs: Job[];
};
