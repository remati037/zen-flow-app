CREATE INDEX "daily_tasks_user_date_idx" ON "daily_tasks" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "focus_quiz_results_user_date_idx" ON "focus_quiz_results" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "focus_sessions_user_idx" ON "focus_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_log_user_type_status_sent_idx" ON "notifications_log" USING btree ("user_id","type","status","sent_at");--> statement-breakpoint
CREATE INDEX "orders_email_lower_date_idx" ON "orders" USING btree (lower("email"),"order_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "protocol_logs_date_taken_idx" ON "protocol_logs" USING btree ("date") WHERE "protocol_logs"."status" = 'taken';