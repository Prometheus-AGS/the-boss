ALTER TABLE `agent_session` ADD `model` text REFERENCES user_model(id) ON UPDATE no action ON DELETE SET NULL;
