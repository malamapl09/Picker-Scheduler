# Manager User Guide

This guide covers all features available to managers in the Picker Scheduling System.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Managing Stores](#managing-stores)
4. [Managing Employees](#managing-employees)
5. [Creating Schedules](#creating-schedules)
6. [Editing Schedules](#editing-schedules)
7. [Handling Call-Outs](#handling-call-outs)
8. [Time-Off Requests](#time-off-requests)
9. [Shift Swaps](#shift-swaps)
10. [Reports & Analytics](#reports--analytics)
11. [Data Import/Export](#data-importexport)

---

## Getting Started

### Logging In

1. Navigate to the application URL
2. Enter your email and password
3. Click **Sign In**

After logging in, you'll be directed to the Manager Portal.

### Navigation

The sidebar contains all main sections:

- **Overview** - Quick summary and key metrics
- **Stores** - Manage store locations
- **Analytics** - Detailed dashboard and charts
- **Schedules** - Create and manage weekly schedules
- **Employees** - View and manage staff
- **Call-Outs** - Handle same-day absences
- **Time Off** - Review time-off requests
- **Shift Swaps** - Approve employee shift exchanges
- **Reports** - Labor and compliance reports
- **Data** - Import/export data

### Store Selector

The store selector in the sidebar lets you switch between stores. Most views are filtered by the selected store.

---

## Dashboard Overview

The Analytics dashboard provides:

### Key Metrics Cards
- **Scheduled Hours** - Total hours scheduled this week
- **Employees** - Active employee count
- **Coverage Score** - Percentage of demand covered
- **Compliance** - Labor rule compliance status

### Charts
- **Weekly Trends** - Hours, costs, and efficiency over time
- **Coverage Breakdown** - Visual of staffing vs. demand
- **Store Comparison** - Performance across all stores

---

## Managing Stores

### Viewing Stores

1. Click **Stores** in the sidebar
2. View all stores in a table with:
   - Store name and code
   - Address
   - Operating hours

### Creating a Store

1. Click **Add Store**
2. Fill in:
   - **Store Name** - Display name (e.g., "Downtown Store")
   - **Store Code** - Unique identifier (e.g., "DT001")
   - **Address** - Physical location (optional)
   - **Operating Hours** - Opening and closing times
3. Click **Create Store**

### Editing a Store

1. Click the **Edit** (pencil) icon on any store row
2. Modify the fields as needed
3. Click **Save Changes**

Note: Store codes cannot be changed after creation.

### Deleting a Store

1. Click the **Delete** (trash) icon on any store row
2. Confirm the deletion

Warning: Deleting a store will affect all associated employees, schedules, and historical data.

---

## Managing Employees

### Viewing Employees

1. Click **Employees** in the sidebar
2. View all employees for the selected store
3. See status indicators (Active, Inactive, On Leave)

### Employee Details

Click on any employee to view:
- Personal information
- Assigned store
- Current schedule
- Availability preferences
- Time-off history

### Importing Employees

For bulk employee creation, use the Data Import feature (see [Data Import/Export](#data-importexport)).

---

## Creating Schedules

### Starting a New Schedule

1. Click **Schedules** in the sidebar
2. Click **New Schedule** or **Create Schedule**
3. Select the store and week

### Using the Optimizer

The schedule optimizer automatically generates shifts based on:
- Forecasted demand
- Employee availability
- Compliance rules
- Fair distribution

**Steps:**

1. On the new schedule page, click **Generate Forecast**
   - This predicts order volume for each hour of the week
   - Review the forecast chart

2. Click **Generate Schedule**
   - The optimizer creates shifts to match demand
   - Wait for the optimization to complete (usually 5-30 seconds)

3. Review the results:
   - **Coverage Score** - How well shifts match demand
   - **Total Shifts** - Number of shifts created
   - **Employees Scheduled** - How many employees have shifts
   - **Warnings** - Any issues to address

### Manual Adjustments

After optimization, you can:

- **Drag shifts** to move them between employees
- **Click shifts** to edit times
- **Add shifts** for additional coverage
- **Remove shifts** that aren't needed

### Locking Shifts

To preserve specific assignments during re-optimization:

1. Select a shift
2. Click **Lock Shift**
3. The shift will be highlighted and won't change on re-generation

### Publishing

Once satisfied with the schedule:

1. Click **Save as Draft** to save without publishing
2. Click **Publish Schedule** to notify employees

Published schedules:
- Appear in the Employee Portal
- Send notifications to all scheduled employees
- Cannot be easily unpublished (requires manager action)

---

## Editing Schedules

### Viewing Existing Schedules

1. Click **Schedules** in the sidebar
2. Filter by status (Draft, Published, Archived)
3. Click on a schedule to view details

### Making Changes

**Published schedules** can still be edited:

1. Open the schedule
2. Make changes (add/edit/remove shifts)
3. Click **Save Changes**
4. Affected employees receive notifications

**Best Practices:**
- Minimize changes to published schedules
- Communicate significant changes directly to affected employees
- Use the notes feature to document reasons for changes

---

## Handling Call-Outs

When an employee calls out sick or can't make their shift:

### Marking a Call-Out

1. Click **Call-Outs** in the sidebar
2. Find the shift and click **Mark Call-Out**
3. Optionally add a reason
4. The shift is now marked as uncovered

### Finding Replacements

1. Click **Find Replacement** on the call-out shift
2. The system shows available employees who:
   - Are not already scheduled at that time
   - Won't exceed weekly hour limits
   - Are available per their preferences
3. Review compliance status for each option
4. Click **Assign** to give the shift to a replacement

### Force Assignment

If no compliant options exist:

1. Toggle **Show All Employees**
2. Non-compliant options show warnings
3. Use **Force Assign** to override (use sparingly)

### Reverting a Call-Out

If an employee's situation changes:

1. Find the call-out in the list
2. Click **Revert Call-Out**
3. The original shift is restored

---

## Time-Off Requests

### Reviewing Requests

1. Click **Time Off** in the sidebar
2. View pending requests at the top
3. See approved and denied history below

### Request Details

Each request shows:
- Employee name
- Requested dates
- Reason (if provided)
- Current schedule conflicts

### Approving/Denying

1. Click on a pending request
2. Review the details and any conflicts
3. Click **Approve** or **Deny**
4. The employee is notified automatically

### Considerations

Before approving, check:
- Will there be enough coverage on those dates?
- Are other employees already off?
- Can shifts be reassigned if needed?

---

## Shift Swaps

Employees can request to swap shifts with each other. Managers must approve.

### Reviewing Swap Requests

1. Click **Shift Swaps** in the sidebar
2. View pending swap requests
3. Each shows both shifts involved

### Approving Swaps

1. Review that both employees agree
2. Check compliance for both parties
3. Click **Approve** or **Deny**
4. Both employees are notified

### What to Check

- Neither employee exceeds hour limits
- Both have required days off
- Coverage is maintained

---

## Reports & Analytics

### Available Reports

1. Click **Reports** in the sidebar
2. Select report type:

**Labor Summary**
- Total scheduled hours
- Hours by employee
- Hours by day

**Coverage Analysis**
- Required vs. scheduled hours
- Understaffed/overstaffed periods
- Coverage score breakdown

**Compliance Report**
- Rule violations (if any)
- Warnings for near-violations
- Per-employee compliance status

**Efficiency Metrics**
- Orders per picker-hour
- Labor cost trends
- Utilization rates

### Filtering Reports

- Select date range
- Choose specific store or all stores
- Group by day, week, or month

### Exporting

Click **Export** to download reports as:
- CSV (spreadsheet compatible)
- Excel (.xlsx)

---

## Data Import/Export

### Importing Data

1. Click **Data** in the sidebar
2. Select the **Import** tab
3. Choose data type:
   - **Employees** - Bulk add staff
   - **Historical Orders** - Order data for forecasting
   - **Availability** - Employee preferences

4. Download the template
5. Fill in the data (see format requirements below)
6. Upload the completed file
7. Review the preview
8. Confirm import

### Import Formats

**Employees:**
```csv
first_name,last_name,email,store_code,hire_date,status
John,Doe,john@example.com,DT001,2024-01-15,active
```

**Historical Orders:**
```csv
store_code,date,hour,order_count
DT001,2024-12-01,10,15.5
DT001,2024-12-01,11,22.3
```

**Availability:**
```csv
employee_email,day_of_week,is_available,preferred_start,preferred_end
john@example.com,0,true,08:00,16:00
```

### Exporting Data

1. Select the **Export** tab
2. Choose data type:
   - **Employees** - Full employee list
   - **Schedule** - Selected schedule with all shifts
   - **Labor Report** - Hours and costs for date range

3. Select format (CSV or Excel)
4. Click **Export**
5. File downloads automatically

---

## Tips & Best Practices

### Scheduling

1. **Generate forecasts early** - Run forecasts at least a week ahead
2. **Review before publishing** - Check for gaps and conflicts
3. **Publish consistently** - Employees expect schedules by a certain day
4. **Keep a buffer** - Don't schedule at 100% capacity

### Compliance

1. **Watch hour limits** - The system warns but can be overridden
2. **Ensure days off** - Every employee needs at least one day off per week
3. **Track overtime** - Stay under 44 hours/week per employee

### Communication

1. **Use notifications** - The system notifies employees automatically
2. **Document changes** - Add notes when modifying published schedules
3. **Be responsive** - Review time-off and swap requests promptly

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Esc` | Close modal/dialog |
| `Enter` | Submit form |
| `/` | Open search (if available) |

---

## Getting Help

If you encounter issues:

1. Check the API docs at `/docs` endpoint
2. Review error messages in notifications
3. Contact your system administrator

For technical issues, check the server logs or contact support.
