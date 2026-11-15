# Early-user usage tracking

The server ledger records account, project, model, action, success/failure,
duration and provider token usage for image edits, Master, Harmonize, object
maps, Gemini chat, SAM point/semantic/auto requests and supporting vision/naming
calls. Supporting service calls do not spend demo image credits. Raw usage
details retain numeric token breakdowns, including cached and reasoning counts
when reported; images, prompts, credentials and provider error text are excluded.

Admin Overview, Users and Project usage show activity, known-cost coverage,
service counts/failures/average latency and daily charts for images, services,
tokens and known estimated costs. Totals are scoped by environment/user/project.
Large histories explicitly report truncation.

Reported token counts are provider measurements. Costs are estimates, not a
billing ledger. Image estimates use the existing Sunburst standard tariff;
cached input without a verified modality breakdown remains unknown. Supporting
model tariffs and SAM GPU billing remain unknown rather than zero. SAM wall-clock
latency includes queuing/network time and is not GPU-seconds. The dashboard does
not reconstruct historical supporting-service usage or failed-response tokens
that providers never returned.

Migration `202611140001_provider_usage.sql` extends the existing server-only
ledger and preserves its access controls. Frontend and server changes must be
deployed together; the migration alone does not enable new application tracking.
