import config from "../../config/app.json" with { type: "json" };
import { googleFormUrl } from "../../shared/feedback.ts";

export const feedbackFormUrl = googleFormUrl(config.feedback.googleFormUrl);
