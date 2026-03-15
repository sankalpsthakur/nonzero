-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('SOLO_LAB', 'TEAM');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'RESEARCHER', 'REVIEWER', 'TRADER');

-- CreateEnum
CREATE TYPE "CreditBucket" AS ENUM ('TESTING', 'LIVE_OPS');

-- CreateEnum
CREATE TYPE "CreditLedgerType" AS ENUM ('RESERVE', 'DEBIT', 'RELEASE', 'TOPUP');

-- CreateEnum
CREATE TYPE "CreditReservationStatus" AS ENUM ('PENDING', 'SETTLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "BrokerProvider" AS ENUM ('ZERODHA');

-- CreateEnum
CREATE TYPE "BrokerAccountStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "StrategyVersionStatus" AS ENUM ('DRAFT', 'TESTING', 'PAPER', 'SHADOW_LIVE', 'LIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "SwarmStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SwarmChildStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RunEnvironment" AS ENUM ('RESEARCH', 'PAPER', 'SHADOW_LIVE', 'LIVE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "RunEventType" AS ENUM ('LOG', 'METRIC', 'HEARTBEAT', 'ERROR', 'ARTIFACT');

-- CreateEnum
CREATE TYPE "RunArtifactType" AS ENUM ('EQUITY_CURVE', 'REPORT', 'NOTEBOOK', 'PARQUET', 'CHART', 'CODE_SNAPSHOT');

-- CreateEnum
CREATE TYPE "DeploymentEnvironment" AS ENUM ('PAPER', 'SHADOW_LIVE', 'LIVE');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'PAUSED', 'STOPPED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TradeAction" AS ENUM ('BUY', 'SELL', 'HOLD');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'SL', 'SL_M');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('CNC', 'MIS', 'NRML');

-- CreateEnum
CREATE TYPE "OrderIntentStatus" AS ENUM ('PENDING', 'APPROVED', 'SUBMITTED', 'FILLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskPolicyType" AS ENUM ('MAX_CAPITAL', 'MAX_DAILY_LOSS', 'MAX_ORDER_SIZE', 'MAX_EXPOSURE', 'MAX_CONCURRENT', 'MAX_SLIPPAGE');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('DEPLOY_LIVE', 'PLACE_ORDER', 'MODIFY_RISK', 'WIDEN_BUDGET');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('RESEARCH_DIRECTOR', 'SWARM_ORCHESTRATOR', 'STRATEGY_GENERATOR', 'BACKTEST_RUNNER', 'CRITIC', 'DEPLOYMENT', 'BROKER', 'RISK_GUARDIAN', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('IDLE', 'ACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'PARTIAL', 'BLOCKED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "DivergenceSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('DIVERGENCE', 'RISK_BREACH', 'EXECUTION_FAILURE', 'SYSTEM_ERROR');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bucket" "CreditBucket" NOT NULL,
    "balance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "reservedBalance" DECIMAL(20,4) NOT NULL DEFAULT 0,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "CreditLedgerType" NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditReservation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "status" "CreditReservationStatus" NOT NULL DEFAULT 'PENDING',
    "runId" TEXT,
    "swarmId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "BrokerProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecretEncrypted" TEXT NOT NULL,
    "clientId" TEXT,
    "status" "BrokerAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerSession" (
    "id" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "publicToken" TEXT,
    "loginTime" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BrokerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymbolMaster" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "tradingSymbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instrumentToken" INTEGER NOT NULL,
    "lotSize" INTEGER NOT NULL DEFAULT 1,
    "instrumentType" TEXT NOT NULL,
    "expiry" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "SymbolMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingChecklist" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceCreated" BOOLEAN NOT NULL DEFAULT false,
    "researchBriefSet" BOOLEAN NOT NULL DEFAULT false,
    "infraConnected" BOOLEAN NOT NULL DEFAULT false,
    "swarmTemplateSelected" BOOLEAN NOT NULL DEFAULT false,
    "validationSwarmRun" BOOLEAN NOT NULL DEFAULT false,
    "livePrereqsUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyFamily" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "benchmark" TEXT,
    "universe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "configSnapshot" JSONB,
    "metrics" JSONB,
    "status" "StrategyVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hypothesis" TEXT,
    "objective" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwarmTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shape" JSONB NOT NULL,
    "defaultConcurrency" INTEGER NOT NULL DEFAULT 5,
    "defaultCreditCeiling" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwarmTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Swarm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" "SwarmStatus" NOT NULL DEFAULT 'PENDING',
    "controllerAgent" TEXT,
    "activeChildCount" INTEGER NOT NULL DEFAULT 0,
    "creditReservationId" TEXT,
    "currentBestCandidateId" TEXT,
    "failureRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Swarm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwarmChild" (
    "id" TEXT NOT NULL,
    "swarmId" TEXT NOT NULL,
    "runId" TEXT,
    "status" "SwarmChildStatus" NOT NULL DEFAULT 'PENDING',
    "hypothesis" TEXT,
    "score" DOUBLE PRECISION,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SwarmChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "RunEnvironment" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "sandboxId" TEXT,
    "sandboxName" TEXT,
    "hypothesis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "config" JSONB,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunAttempt" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "exitCode" INTEGER,
    "logUrl" TEXT,

    CONSTRAINT "RunAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "RunEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RunArtifactType" NOT NULL,
    "url" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "strategyVersionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "DeploymentEnvironment" NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "capitalAllocated" DECIMAL(20,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperLedger" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "action" "TradeAction" NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(20,4) NOT NULL,
    "fees" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "pnl" DECIMAL(20,4),

    CONSTRAINT "PaperLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveLedger" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(20,4) NOT NULL,
    "fees" DECIMAL(20,4) NOT NULL,
    "pnl" DECIMAL(20,4),
    "brokerOrderId" TEXT,

    CONSTRAINT "LiveLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderIntent" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(20,4),
    "triggerPrice" DECIMAL(20,4),
    "product" "ProductType" NOT NULL,
    "status" "OrderIntentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "OrderIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerOrder" (
    "id" TEXT NOT NULL,
    "orderIntentId" TEXT NOT NULL,
    "brokerOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filledQuantity" INTEGER NOT NULL DEFAULT 0,
    "averagePrice" DECIMAL(20,4),
    "statusMessage" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerTrade" (
    "id" TEXT NOT NULL,
    "brokerOrderId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(20,4) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "averagePrice" DECIMAL(20,4) NOT NULL,
    "lastPrice" DECIMAL(20,4),
    "pnl" DECIMAL(20,4),
    "snapshotAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RiskPolicyType" NOT NULL,
    "threshold" DECIMAL(20,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "AgentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "mandate" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'IDLE',
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DivergenceReport" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entryTimeDelta" DOUBLE PRECISION,
    "priceDelta" DOUBLE PRECISION,
    "fillRateDelta" DOUBLE PRECISION,
    "positionDelta" DOUBLE PRECISION,
    "pnlDelta" DOUBLE PRECISION,
    "divergenceScore" DOUBLE PRECISION NOT NULL,
    "severity" "DivergenceSeverity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DivergenceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "divergenceReportId" TEXT,
    "type" "IncidentType" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_slug_idx" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_workspaceId_idx" ON "WorkspaceMembership"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_userId_idx" ON "WorkspaceMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_workspaceId_userId_key" ON "WorkspaceMembership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CreditAccount_workspaceId_idx" ON "CreditAccount"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_workspaceId_bucket_key" ON "CreditAccount"("workspaceId", "bucket");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_accountId_idx" ON "CreditLedgerEntry"("accountId");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_createdAt_idx" ON "CreditLedgerEntry"("createdAt");

-- CreateIndex
CREATE INDEX "CreditReservation_accountId_idx" ON "CreditReservation"("accountId");

-- CreateIndex
CREATE INDEX "CreditReservation_status_idx" ON "CreditReservation"("status");

-- CreateIndex
CREATE INDEX "BrokerAccount_workspaceId_idx" ON "BrokerAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "BrokerAccount_status_idx" ON "BrokerAccount"("status");

-- CreateIndex
CREATE INDEX "BrokerSession_brokerAccountId_idx" ON "BrokerSession"("brokerAccountId");

-- CreateIndex
CREATE INDEX "BrokerSession_isActive_idx" ON "BrokerSession"("isActive");

-- CreateIndex
CREATE INDEX "SymbolMaster_workspaceId_idx" ON "SymbolMaster"("workspaceId");

-- CreateIndex
CREATE INDEX "SymbolMaster_exchange_tradingSymbol_idx" ON "SymbolMaster"("exchange", "tradingSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "SymbolMaster_workspaceId_exchange_tradingSymbol_key" ON "SymbolMaster"("workspaceId", "exchange", "tradingSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingChecklist_workspaceId_key" ON "OnboardingChecklist"("workspaceId");

-- CreateIndex
CREATE INDEX "StrategyFamily_workspaceId_idx" ON "StrategyFamily"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyFamily_workspaceId_slug_key" ON "StrategyFamily"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "StrategyVersion_familyId_idx" ON "StrategyVersion"("familyId");

-- CreateIndex
CREATE INDEX "StrategyVersion_status_idx" ON "StrategyVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_familyId_version_key" ON "StrategyVersion"("familyId", "version");

-- CreateIndex
CREATE INDEX "Experiment_familyId_idx" ON "Experiment"("familyId");

-- CreateIndex
CREATE INDEX "Experiment_workspaceId_idx" ON "Experiment"("workspaceId");

-- CreateIndex
CREATE INDEX "Swarm_workspaceId_idx" ON "Swarm"("workspaceId");

-- CreateIndex
CREATE INDEX "Swarm_status_idx" ON "Swarm"("status");

-- CreateIndex
CREATE INDEX "Swarm_familyId_idx" ON "Swarm"("familyId");

-- CreateIndex
CREATE INDEX "SwarmChild_swarmId_idx" ON "SwarmChild"("swarmId");

-- CreateIndex
CREATE INDEX "SwarmChild_status_idx" ON "SwarmChild"("status");

-- CreateIndex
CREATE INDEX "Run_experimentId_idx" ON "Run"("experimentId");

-- CreateIndex
CREATE INDEX "Run_workspaceId_idx" ON "Run"("workspaceId");

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE INDEX "RunAttempt_runId_idx" ON "RunAttempt"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RunAttempt_runId_attemptNumber_key" ON "RunAttempt"("runId", "attemptNumber");

-- CreateIndex
CREATE INDEX "RunEvent_runId_idx" ON "RunEvent"("runId");

-- CreateIndex
CREATE INDEX "RunEvent_type_idx" ON "RunEvent"("type");

-- CreateIndex
CREATE INDEX "RunEvent_createdAt_idx" ON "RunEvent"("createdAt");

-- CreateIndex
CREATE INDEX "RunArtifact_runId_idx" ON "RunArtifact"("runId");

-- CreateIndex
CREATE INDEX "Deployment_workspaceId_idx" ON "Deployment"("workspaceId");

-- CreateIndex
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- CreateIndex
CREATE INDEX "Deployment_strategyVersionId_idx" ON "Deployment"("strategyVersionId");

-- CreateIndex
CREATE INDEX "PaperLedger_deploymentId_idx" ON "PaperLedger"("deploymentId");

-- CreateIndex
CREATE INDEX "PaperLedger_timestamp_idx" ON "PaperLedger"("timestamp");

-- CreateIndex
CREATE INDEX "LiveLedger_deploymentId_idx" ON "LiveLedger"("deploymentId");

-- CreateIndex
CREATE INDEX "LiveLedger_timestamp_idx" ON "LiveLedger"("timestamp");

-- CreateIndex
CREATE INDEX "OrderIntent_deploymentId_idx" ON "OrderIntent"("deploymentId");

-- CreateIndex
CREATE INDEX "OrderIntent_workspaceId_idx" ON "OrderIntent"("workspaceId");

-- CreateIndex
CREATE INDEX "OrderIntent_status_idx" ON "OrderIntent"("status");

-- CreateIndex
CREATE INDEX "OrderIntent_createdAt_idx" ON "OrderIntent"("createdAt");

-- CreateIndex
CREATE INDEX "BrokerOrder_orderIntentId_idx" ON "BrokerOrder"("orderIntentId");

-- CreateIndex
CREATE INDEX "BrokerOrder_brokerOrderId_idx" ON "BrokerOrder"("brokerOrderId");

-- CreateIndex
CREATE INDEX "BrokerTrade_brokerOrderId_idx" ON "BrokerTrade"("brokerOrderId");

-- CreateIndex
CREATE INDEX "PositionSnapshot_workspaceId_idx" ON "PositionSnapshot"("workspaceId");

-- CreateIndex
CREATE INDEX "PositionSnapshot_snapshotAt_idx" ON "PositionSnapshot"("snapshotAt");

-- CreateIndex
CREATE INDEX "RiskPolicy_workspaceId_idx" ON "RiskPolicy"("workspaceId");

-- CreateIndex
CREATE INDEX "RiskPolicy_type_idx" ON "RiskPolicy"("type");

-- CreateIndex
CREATE INDEX "ApprovalRequest_workspaceId_idx" ON "ApprovalRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_createdAt_idx" ON "ApprovalRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AgentProfile_workspaceId_idx" ON "AgentProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "AgentProfile_kind_idx" ON "AgentProfile"("kind");

-- CreateIndex
CREATE INDEX "AgentProfile_status_idx" ON "AgentProfile"("status");

-- CreateIndex
CREATE INDEX "AgentTask_agentId_idx" ON "AgentTask"("agentId");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_createdAt_idx" ON "AgentTask"("createdAt");

-- CreateIndex
CREATE INDEX "DivergenceReport_deploymentId_idx" ON "DivergenceReport"("deploymentId");

-- CreateIndex
CREATE INDEX "DivergenceReport_workspaceId_idx" ON "DivergenceReport"("workspaceId");

-- CreateIndex
CREATE INDEX "DivergenceReport_severity_idx" ON "DivergenceReport"("severity");

-- CreateIndex
CREATE INDEX "DivergenceReport_createdAt_idx" ON "DivergenceReport"("createdAt");

-- CreateIndex
CREATE INDEX "Incident_workspaceId_idx" ON "Incident"("workspaceId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_type_idx" ON "Incident"("type");

-- CreateIndex
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAccount" ADD CONSTRAINT "BrokerAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerSession" ADD CONSTRAINT "BrokerSession_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymbolMaster" ADD CONSTRAINT "SymbolMaster_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChecklist" ADD CONSTRAINT "OnboardingChecklist_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyFamily" ADD CONSTRAINT "StrategyFamily_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "StrategyFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "StrategyFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Swarm" ADD CONSTRAINT "Swarm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Swarm" ADD CONSTRAINT "Swarm_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SwarmTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Swarm" ADD CONSTRAINT "Swarm_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "StrategyFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwarmChild" ADD CONSTRAINT "SwarmChild_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwarmChild" ADD CONSTRAINT "SwarmChild_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunAttempt" ADD CONSTRAINT "RunAttempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunArtifact" ADD CONSTRAINT "RunArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperLedger" ADD CONSTRAINT "PaperLedger_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveLedger" ADD CONSTRAINT "LiveLedger_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderIntent" ADD CONSTRAINT "OrderIntent_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderIntent" ADD CONSTRAINT "OrderIntent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerOrder" ADD CONSTRAINT "BrokerOrder_orderIntentId_fkey" FOREIGN KEY ("orderIntentId") REFERENCES "OrderIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerTrade" ADD CONSTRAINT "BrokerTrade_brokerOrderId_fkey" FOREIGN KEY ("brokerOrderId") REFERENCES "BrokerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionSnapshot" ADD CONSTRAINT "PositionSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskPolicy" ADD CONSTRAINT "RiskPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DivergenceReport" ADD CONSTRAINT "DivergenceReport_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DivergenceReport" ADD CONSTRAINT "DivergenceReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_divergenceReportId_fkey" FOREIGN KEY ("divergenceReportId") REFERENCES "DivergenceReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

