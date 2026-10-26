ALTER TABLE requests
  ADD COLUMN assigned_technician_id BIGINT UNSIGNED NULL AFTER assigned_mis_user_id;

ALTER TABLE requests
  ADD KEY idx_requests_assigned_technician (assigned_technician_id);

ALTER TABLE requests
  ADD CONSTRAINT fk_requests_assigned_technician FOREIGN KEY (assigned_technician_id)
    REFERENCES technicians (id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE request_history
  ADD COLUMN old_assigned_technician_id BIGINT UNSIGNED NULL AFTER new_assignee_user_id;

ALTER TABLE request_history
  ADD COLUMN new_assigned_technician_id BIGINT UNSIGNED NULL AFTER old_assigned_technician_id;

ALTER TABLE request_history
  ADD CONSTRAINT fk_request_history_old_technician FOREIGN KEY (old_assigned_technician_id)
    REFERENCES technicians (id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE request_history
  ADD CONSTRAINT fk_request_history_new_technician FOREIGN KEY (new_assigned_technician_id)
    REFERENCES technicians (id) ON DELETE RESTRICT ON UPDATE CASCADE;
