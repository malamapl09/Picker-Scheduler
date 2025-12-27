# Picker Scheduling & Labor Optimization

## Project Brief & Requirements Document

**Online Order Fulfillment Workforce Management**

Version 1.0 | December 2024

---

**CONFIDENTIAL**

---

## 1. Executive Summary

This project will implement an automated scheduling system for online order pickers across our 24 retail locations. The solution will replace manual spreadsheet-based scheduling with a demand-driven system that predicts order volume, generates optimized schedules, and ensures compliance with labor regulations.

By leveraging transaction timestamp data to forecast online order demand, the system will automatically match picker staffing levels to anticipated workload—eliminating understaffing during peak periods and reducing unnecessary labor costs during slow periods.

This project is designed to integrate with the parallel Demand Forecasting Enhancement initiative, sharing data infrastructure and prediction capabilities for maximum efficiency.

---

## 2. Business Context & Problem Statement

### 2.1 Current State

Today, picker scheduling is managed through a decentralized, manual process:

- Store managers create weekly schedules using spreadsheets
- Scheduling decisions are based on manager intuition rather than data
- No systematic connection between online order patterns and staffing levels
- Compliance tracking (hours, overtime, breaks) is manual and error-prone

### 2.2 Current Challenges

| Challenge | Business Impact |
|-----------|-----------------|
| Understaffing at peak times | Delayed order fulfillment, poor customer experience, missed SLAs |
| Overstaffing during slow periods | Unnecessary labor costs, reduced profitability, idle workers |
| Last-minute call-outs | Scramble to find coverage, manager time wasted, potential service gaps |
| Compliance issues | Overtime violations, missed breaks, risk of labor law penalties |
| Manager time on scheduling | Hours spent weekly on spreadsheets instead of operations and team development |

---

## 3. Current State Assessment

### 3.1 Workforce Profile

| Attribute | Details |
|-----------|---------|
| Total Picker Workforce | 50 employees across 24 stores |
| Role | Online order pickers (single role) |
| Weekly Hours Requirement | 44 hours per week |
| Daily Hours Limit | Maximum 8 hours per day |
| Work Pattern | 6 days on, 1 day off per week |
| Store Hours | Consistent across all locations |

### 3.2 Data Availability

| Data Source | Details |
|-------------|---------|
| Online Order Data | Transaction-level with exact timestamps (Oracle) |
| Employee Time Data | Daily time clock records |
| Foot Traffic | Not available (not required for online order picking) |

**Key Advantage:** Transaction-level timestamps provide excellent demand signal for predicting picker workload by hour.

---

## 4. Project Objectives

1. **Reduce Labor Costs:** Decrease labor spend as a percentage of online order revenue by eliminating overstaffing.

2. **Improve Coverage:** Ensure adequate picker staffing during peak order periods to meet fulfillment SLAs.

3. **Ensure Compliance:** Automatically enforce 44-hour weekly limits, 8-hour daily limits, and required breaks.

4. **Save Manager Time:** Reduce weekly scheduling effort from hours to minutes through automation.

5. **Handle Disruptions:** Provide tools to quickly manage call-outs and shift swaps.

6. **Improve Employee Experience:** Give pickers visibility into schedules, easy availability submission, and fair shift distribution.

---

## 5. Scope

### 5.1 In Scope

1. Demand forecasting for online order volume by store and hour
2. Labor standards engine (orders per picker-hour calculations)
3. Automated schedule generation with optimization
4. Compliance rules engine (44hr/week, 8hr/day, 6-day pattern, breaks)
5. Manager web portal for schedule review, adjustment, and publishing
6. Employee web portal for availability, time-off requests, and shift swaps
7. Reporting dashboard (labor efficiency, coverage scores, compliance)
8. Integration with demand forecasting data infrastructure

### 5.2 Out of Scope

- Mobile application (web portal only for initial release)
- Integration with time clock system (separate for now)
- Payroll integration
- Scheduling for non-picker roles
- Performance management or productivity tracking

---

## 6. Proposed Solution Architecture

### 6.1 System Components

| Component | Description |
|-----------|-------------|
| Demand Forecaster | Predicts online order volume by store and hour using historical transaction data. Shares infrastructure with Demand Forecasting Enhancement project. |
| Labor Standards Engine | Converts predicted order volume into required picker hours based on configurable productivity standards (e.g., 10 orders per picker-hour). |
| Schedule Optimizer | Generates schedules that match staffing to demand while respecting labor rules, employee availability, and fairness constraints. |
| Compliance Engine | Enforces 44hr/week max, 8hr/day max, 6-day work pattern, break requirements. Prevents violations before schedule publication. |
| Manager Portal | Web interface for managers to review auto-generated schedules, make adjustments, handle exceptions, and publish to employees. |
| Employee Portal | Web interface for pickers to view schedules, submit availability, request time off, and initiate shift swaps. |
| Reporting Dashboard | Tracks labor cost vs. revenue, schedule efficiency, coverage scores, compliance metrics, and picker utilization. |

### 6.2 Integration with Demand Forecasting Project

This project will leverage the data infrastructure being built for the Demand Forecasting Enhancement initiative:

- **Shared Data Warehouse:** Same Snowflake/BigQuery instance stores both sales forecasts and order volume predictions
- **Shared ETL Pipeline:** Transaction data extraction serves both forecasting and scheduling needs
- **Shared ML Platform:** Same AutoML service can train both demand and order volume models
- **Unified Reporting:** Power BI dashboards can show both inventory and labor metrics

### 6.3 Technology Recommendations

| Component | Recommendation | Rationale |
|-----------|----------------|-----------|
| Schedule Optimizer | Google OR-Tools or OptaPlanner | Open-source, proven for workforce scheduling, handles constraints well |
| Web Application | React + Node.js or Python Flask | Modern, responsive, easy to maintain, strong developer ecosystem |
| Database | PostgreSQL | Robust, open-source, handles scheduling data well |
| Hosting | AWS or GCP | Align with demand forecasting infrastructure choice |
| Reporting | Power BI | Consistent with forecasting project, familiar to team |

---

## 7. Scheduling Logic

### 7.1 How Automated Scheduling Works

1. **Forecast Order Volume:** Predict online orders by store and hour for the upcoming week

2. **Calculate Labor Need:** Apply labor standard (e.g., 1 picker per 10 orders/hour) to determine required picker-hours

3. **Load Constraints:** Import employee availability, time-off requests, and labor rules

4. **Optimize Schedule:** Algorithm assigns shifts to minimize cost while meeting coverage and compliance requirements

5. **Manager Review:** Manager reviews proposed schedule, makes adjustments if needed

6. **Publish:** Final schedule is published and visible to employees

### 7.2 Compliance Rules

The following rules will be enforced by the system:

| Rule | System Behavior |
|------|-----------------|
| 44 hours per week maximum | System will not schedule employee beyond 44 hours; warns manager if approaching limit |
| 8 hours per day maximum | Shifts capped at 8 hours; system prevents longer assignments |
| 6 days on, 1 day off | System ensures each employee has one full day off per week |
| Required breaks | Break periods automatically included in shifts based on shift length |

---

## 8. Phased Implementation Roadmap

### Phase 1: Foundation (Months 1-2)

**Objective:** Establish data foundation and core scheduling engine

| Activities | Deliverables |
|------------|--------------|
| Extract online order history | Order volume predictions by store/hour |
| Build order volume forecasting model | Labor standards documentation |
| Define labor standards | Working schedule optimizer |
| Configure compliance rules | Compliance rules engine |
| Build core scheduling algorithm | |

### Phase 2: Manager Tools (Months 3-4)

**Objective:** Deploy manager-facing portal and pilot

| Activities | Deliverables |
|------------|--------------|
| Build manager web portal | Manager portal (web) |
| Create schedule review/edit interface | Schedule editing tools |
| Implement exception handling | Pilot results report |
| Pilot with 3-5 stores | Refined requirements |
| Gather feedback and iterate | |

### Phase 3: Employee Tools & Rollout (Months 5-6)

**Objective:** Full deployment with employee self-service

| Activities | Deliverables |
|------------|--------------|
| Build employee portal | Employee portal (web) |
| Implement availability submission | Self-service features |
| Add shift swap functionality | Power BI dashboards |
| Build reporting dashboards | Full production deployment |
| Roll out to all 24 stores | Training materials |
| Train managers and employees | |

---

## 9. Key Deliverables

1. **Order Volume Forecasting Model:** Predicts online orders by store and hour

2. **Labor Standards Engine:** Configurable productivity calculations

3. **Schedule Optimizer:** Automated schedule generation with optimization

4. **Compliance Engine:** Automatic enforcement of labor rules

5. **Manager Web Portal:** Schedule review, editing, and publishing interface

6. **Employee Web Portal:** Self-service for schedules, availability, swaps

7. **Reporting Dashboard:** Labor efficiency, coverage, and compliance metrics

8. **Documentation & Training:** User guides for managers and employees

---

## 10. Success Criteria

1. **Labor Cost Reduction:** 10-15% decrease in picker labor cost as percentage of online order revenue

2. **Coverage Improvement:** 95%+ of peak hours adequately staffed (vs. baseline)

3. **Compliance Rate:** 100% of published schedules compliant with labor rules

4. **Manager Time Savings:** 75% reduction in time spent on scheduling (hours to minutes)

5. **Schedule Stability:** Less than 10% of shifts changed after publication

6. **User Adoption:** 100% of managers using portal within 30 days; 90% employee portal usage

---

## 11. Team Requirements

This project requires a smaller team than the forecasting initiative due to focused scope:

| Role | Duration | Responsibilities |
|------|----------|------------------|
| Full-Stack Developer | 6 months | Manager portal, employee portal, backend services, database |
| Data/ML Engineer | 3-4 months | Order volume forecasting, integration with forecasting project infrastructure |
| Optimization Specialist | 2-3 months | Scheduling algorithm, constraint modeling, optimization tuning |
| Project Manager | 6 months (part-time) | Coordination, stakeholder management (can be shared with forecasting project) |

**Note:** If running concurrently with the Demand Forecasting project, the Data/ML Engineer and Project Manager roles can be shared, reducing overall cost.

---

## 12. Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Manager resistance to automated scheduling | Medium | Involve managers in pilot; keep manual override capability; demonstrate time savings |
| Order volume forecast inaccuracy | Low-Medium | Leverage forecasting project infrastructure; continuous model monitoring |
| Employee pushback on new system | Low | Emphasize benefits (visibility, fair distribution); simple portal design |
| Optimization algorithm complexity | Low | 50 employees is a small problem space; proven open-source tools exist |
| Dependency on forecasting project | Medium | Can build standalone forecasting if needed; coordinate timelines closely |

---

## 13. Budget Considerations

### One-Time Costs

- Development services (based on team composition above)
- Cloud infrastructure setup (can share with forecasting project)
- Training and change management

### Ongoing Costs

- Cloud hosting (minimal for this scale—estimated $200-500/month)
- Support and maintenance (10-15% of build cost annually)
- No per-employee licensing fees (custom solution advantage)

### Cost Synergies with Forecasting Project

Running both projects together creates cost efficiencies through shared data warehouse, shared ML infrastructure, shared project management, and shared Power BI environment. Estimated savings of 20-30% compared to running projects independently.

---

## 14. Next Steps

- Review and approve project brief
- Decide whether to run concurrently with or sequentially after forecasting project
- Define labor standards (orders per picker-hour) with operations team
- Select pilot stores (recommend 3-5 with varying order volumes)
- Engage development team (can extend forecasting project team)
- Schedule kickoff

---

## Appendix A: Data Requirements

### Order Data (from Oracle)

- Online order ID, store, timestamp
- Order item count and complexity (optional, for refined labor standards)
- Historical data (minimum 1 year, ideally 2+)

### Employee Data

- Employee ID, name, assigned store(s)
- Hire date, employment status
- Contact information (for notifications)

### Time & Attendance (reference only)

- Historical time clock data (for initial labor standard calibration)
- Note: Not integrated in Phase 1; can be added later

---

## Appendix B: Sample Manager Portal Screens

The manager portal will include the following key views:

- **Weekly Schedule View:** Calendar grid showing all picker shifts, color-coded by coverage level
- **Demand Overlay:** Predicted order volume shown alongside scheduled hours
- **Compliance Alerts:** Warnings for overtime risk or rule violations
- **Shift Editor:** Drag-and-drop interface for adjustments
- **Call-Out Handler:** Quick view of available replacements when someone calls out
- **Publish Button:** One-click schedule publication with employee notifications

---

## Appendix C: Sample Employee Portal Features

- **My Schedule:** View upcoming shifts with store and time details
- **Availability:** Submit weekly availability preferences
- **Time Off Requests:** Request future days off with manager approval workflow
- **Shift Swap:** Post shifts for swap; accept swaps from coworkers (manager approval)
- **Hours Summary:** View scheduled hours for current and upcoming weeks
