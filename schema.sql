-- Tech IT World CRM Database Schema (PostgreSQL)

-- Drop tables if they exist to avoid conflict (For development/migration purposes)
DROP TABLE IF EXISTS ticket_expenses CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS rma_tickets CASCADE;
DROP TABLE IF EXISTS service_tickets CASCADE;
DROP TABLE IF EXISTS lead_followups CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS lead_status CASCADE;
DROP TYPE IF EXISTS service_status CASCADE;
DROP TYPE IF EXISTS warranty_status CASCADE;
DROP TYPE IF EXISTS rma_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS source_type CASCADE;

-- Enums definition
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'employee');
CREATE TYPE lead_status AS ENUM ('lead_entry', 'follow_up', 'quotation_generated', 'closed_won', 'closed_lost');
CREATE TYPE service_status AS ENUM ('pending', 'assigned', 'solved');
CREATE TYPE warranty_status AS ENUM ('in_warranty', 'out_of_warranty');
CREATE TYPE rma_status AS ENUM ('received', 'sent_to_brand_center', 'waiting_for_approval', 'approved', 'rejected', 'ready', 'delivered');
CREATE TYPE payment_status AS ENUM ('pending_verification', 'settled');
CREATE TYPE source_type AS ENUM ('manual', 'justdial', 'qr_code');

-- 1. Users & Role-Based Access Control (RBAC)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    -- JSON permissions represent access to modules: e.g., {"sales": true, "service": false, "rma": true, "financials": false}
    permissions JSONB NOT NULL DEFAULT '{"sales": false, "service": false, "rma": false, "financials": false}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Sales & Leads Module
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source source_type NOT NULL DEFAULT 'manual',
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(150),
    requirement TEXT,
    status lead_status NOT NULL DEFAULT 'lead_entry',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    next_follow_up_date TIMESTAMP WITH TIME ZONE, -- Mandatory if status is 'follow_up'
    total_amount DECIMAL(12, 2) DEFAULT 0.00,
    quotation_pdf_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lead Followups Tracking
CREATE TABLE lead_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    notes TEXT NOT NULL,
    followup_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Service & AMC Module
CREATE TABLE service_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source source_type NOT NULL DEFAULT 'manual', -- qr_code or manual
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(150),
    device_details VARCHAR(255) NOT NULL,
    issue_description TEXT NOT NULL,
    status service_status NOT NULL DEFAULT 'pending',
    assigned_engineer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    smart_link_token VARCHAR(100) UNIQUE, -- Unique link for field engineer updates
    customer_signature_url VARCHAR(255), -- File path/url to customer signature image
    customer_rating INT CHECK (customer_rating BETWEEN 1 AND 5),
    job_expense DECIMAL(12, 2) DEFAULT 0.00, -- Ticket-specific job expense (parts, cables, etc)
    amount_billed DECIMAL(12, 2) DEFAULT 0.00, -- Bill amount for service
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Repair & RMA Module (Brand Tracking)
CREATE TABLE rma_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(150),
    product_name VARCHAR(150) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    serial_number VARCHAR(100) NOT NULL,
    issue_description TEXT NOT NULL,
    warranty_status warranty_status NOT NULL,
    status rma_status NOT NULL DEFAULT 'received',
    estimate_amount DECIMAL(12, 2) DEFAULT 0.00, -- Quote for out-of-warranty repairs
    brand_charge DECIMAL(12, 2) DEFAULT 0.00,    -- Vendor/Brand Repair charges (job expense)
    challan_pdf_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Central Payment Hub & Expenses
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_module VARCHAR(50) NOT NULL,          -- 'sales', 'service', 'rma'
    source_id UUID NOT NULL,                       -- ID referencing leads(id), service_tickets(id), or rma_tickets(id)
    customer_name VARCHAR(150) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    status payment_status NOT NULL DEFAULT 'pending_verification',
    receipt_pdf_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ticket Expenses Detailed (to itemize job_expense/brand_charge)
CREATE TABLE ticket_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_module VARCHAR(50) NOT NULL,          -- 'service' or 'rma'
    source_id UUID NOT NULL,                       -- ID referencing service_tickets(id) or rma_tickets(id)
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index optimization for foreign keys and status queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_service_assigned_engineer ON service_tickets(assigned_engineer_id);
CREATE INDEX idx_service_smart_token ON service_tickets(smart_link_token);
CREATE INDEX idx_rma_status ON rma_tickets(status);
CREATE INDEX idx_payments_source ON payments(source_module, source_id);
CREATE INDEX idx_payments_status ON payments(status);
