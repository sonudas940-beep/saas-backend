-- Update the default admin user's name
UPDATE users SET name = 'Partha Banerjee' WHERE email = 'admin@techitworld.com';

-- Convert ENUM columns to VARCHAR to support dynamic dropdowns
ALTER TABLE leads ALTER COLUMN source TYPE VARCHAR(100);
ALTER TABLE leads ALTER COLUMN status TYPE VARCHAR(100);
ALTER TABLE service_tickets ALTER COLUMN source TYPE VARCHAR(100);
ALTER TABLE service_tickets ALTER COLUMN status TYPE VARCHAR(100);
ALTER TABLE rma_tickets ALTER COLUMN warranty_status TYPE VARCHAR(100);
ALTER TABLE rma_tickets ALTER COLUMN status TYPE VARCHAR(100);
ALTER TABLE payments ALTER COLUMN status TYPE VARCHAR(100);

-- Create system settings table
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default dropdown values so the UI doesn't break
INSERT INTO system_settings (setting_key, setting_value) VALUES 
('dropdown_lead_source', '["manual", "justdial", "qr_code"]'),
('dropdown_lead_status', '["lead_entry", "follow_up", "quotation_generated", "closed_won", "closed_lost"]'),
('dropdown_service_status', '["pending", "assigned", "solved"]'),
('dropdown_warranty_status', '["in_warranty", "out_of_warranty"]'),
('dropdown_rma_status', '["received", "sent_to_brand_center", "waiting_for_approval", "approved", "rejected", "ready", "delivered"]'),
('whatsapp_api', '{"url": "", "token": "", "enabled": false}')
ON CONFLICT (setting_key) DO NOTHING;
