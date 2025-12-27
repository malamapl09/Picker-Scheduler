from typing import List, Optional
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.shift_swap import ShiftSwap, SwapStatus
from app.models.shift import Shift
from app.models.employee import Employee
from app.models.notification import Notification, NotificationType
from app.schemas.swap import (
    ShiftSwapCreate,
    ShiftSwapUpdate,
    ShiftSwapAccept,
    ShiftSwapResponse,
    ShiftSwapListResponse,
)
from app.api.deps import require_manager_or_admin, get_current_user
from app.models.user import User

router = APIRouter()


def get_employee_for_user(db: Session, user_id: int) -> Optional[Employee]:
    """Get the employee record for a user."""
    return db.query(Employee).filter(Employee.user_id == user_id).first()


def create_notification(
    db: Session,
    user_id: int,
    message: str,
    notification_type: NotificationType
):
    """Create a notification for a user."""
    notification = Notification(
        user_id=user_id,
        message=message,
        type=notification_type
    )
    db.add(notification)


@router.get("/", response_model=List[ShiftSwapListResponse])
async def list_shift_swaps(
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
    status_filter: Optional[SwapStatus] = Query(None, alias="status", description="Filter by status"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List shift swap requests.

    - If employee_id is provided, returns swaps where the employee is involved (requester or acceptor)
    - Can filter by status
    """
    query = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    )

    if employee_id:
        # Get shifts for this employee
        employee_shift_ids = db.query(Shift.id).filter(Shift.employee_id == employee_id).subquery()
        query = query.filter(
            (ShiftSwap.requester_shift_id.in_(employee_shift_ids)) |
            (ShiftSwap.requested_shift_id.in_(employee_shift_ids))
        )

    if status_filter:
        query = query.filter(ShiftSwap.status == status_filter)

    swaps = query.order_by(ShiftSwap.created_at.desc()).offset(skip).limit(limit).all()
    return swaps


@router.get("/available", response_model=List[ShiftSwapListResponse])
async def get_available_swaps(
    employee_id: int = Query(..., description="Current employee's ID to exclude their own swaps"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get open swap requests available for the employee to accept.

    Returns pending swaps from other employees that haven't been accepted yet.
    """
    # Get the employee's shifts to exclude their own swap requests
    employee_shift_ids = db.query(Shift.id).filter(Shift.employee_id == employee_id).subquery()

    # Get the employee's store to only show swaps from same store
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get all employees in the same store
    store_employee_ids = db.query(Employee.id).filter(
        Employee.store_id == employee.store_id
    ).subquery()

    # Get shifts from employees in the same store
    store_shift_ids = db.query(Shift.id).filter(
        Shift.employee_id.in_(store_employee_ids)
    ).subquery()

    # Get pending swaps from other employees in the same store
    swaps = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(
        ShiftSwap.status == SwapStatus.PENDING,
        ShiftSwap.requester_shift_id.in_(store_shift_ids),
        ~ShiftSwap.requester_shift_id.in_(employee_shift_ids),  # Not the employee's own shifts
        ShiftSwap.requester_shift.has(Shift.date >= date.today())  # Only future shifts
    ).order_by(ShiftSwap.created_at.desc()).all()

    return swaps


@router.get("/{swap_id}", response_model=ShiftSwapResponse)
async def get_shift_swap(
    swap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific shift swap request."""
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap_id).first()

    if not swap:
        raise HTTPException(status_code=404, detail="Shift swap not found")

    return swap


@router.post("/", response_model=ShiftSwapResponse)
async def create_shift_swap(
    swap_data: ShiftSwapCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new shift swap request.

    - requester_shift_id: The shift the current user wants to swap away
    - requested_shift_id: Optional. If provided, specifically requesting that shift. If null, open swap.
    """
    # Validate requester shift exists and belongs to current user
    requester_shift = db.query(Shift).options(
        joinedload(Shift.employee)
    ).filter(Shift.id == swap_data.requester_shift_id).first()

    if not requester_shift:
        raise HTTPException(status_code=404, detail="Requester shift not found")

    # Verify the shift belongs to the current user
    employee = get_employee_for_user(db, current_user.id)
    if not employee or requester_shift.employee_id != employee.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only post your own shifts for swap"
        )

    # Check shift is in the future
    if requester_shift.date < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot swap past shifts"
        )

    # Check for existing pending swap for this shift
    existing_swap = db.query(ShiftSwap).filter(
        ShiftSwap.requester_shift_id == swap_data.requester_shift_id,
        ShiftSwap.status.in_([SwapStatus.PENDING, SwapStatus.ACCEPTED])
    ).first()

    if existing_swap:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This shift already has a pending swap request"
        )

    # If requesting a specific shift, validate it
    if swap_data.requested_shift_id:
        requested_shift = db.query(Shift).filter(
            Shift.id == swap_data.requested_shift_id
        ).first()

        if not requested_shift:
            raise HTTPException(status_code=404, detail="Requested shift not found")

        if requested_shift.employee_id == employee.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot swap with your own shift"
            )

    # Create the swap request
    swap = ShiftSwap(
        requester_shift_id=swap_data.requester_shift_id,
        requested_shift_id=swap_data.requested_shift_id,
        notes=swap_data.notes,
        status=SwapStatus.PENDING
    )
    db.add(swap)
    db.commit()
    db.refresh(swap)

    # Load relationships for response
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap.id).first()

    return swap


@router.post("/{swap_id}/accept", response_model=ShiftSwapResponse)
async def accept_shift_swap(
    swap_id: int,
    accept_data: ShiftSwapAccept,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Accept a swap request by offering your own shift in exchange.

    This moves the swap to 'accepted' status, pending manager approval.
    """
    swap = db.query(ShiftSwap).filter(ShiftSwap.id == swap_id).first()
    if not swap:
        raise HTTPException(status_code=404, detail="Shift swap not found")

    if swap.status != SwapStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only accept pending swap requests"
        )

    # Validate the accepting shift
    accepting_shift = db.query(Shift).options(
        joinedload(Shift.employee)
    ).filter(Shift.id == accept_data.accepting_shift_id).first()

    if not accepting_shift:
        raise HTTPException(status_code=404, detail="Accepting shift not found")

    # Verify the shift belongs to the current user
    employee = get_employee_for_user(db, current_user.id)
    if not employee or accepting_shift.employee_id != employee.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only offer your own shifts"
        )

    # Verify not swapping with yourself
    requester_shift = db.query(Shift).filter(
        Shift.id == swap.requester_shift_id
    ).first()
    if requester_shift.employee_id == employee.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot accept your own swap request"
        )

    # Check accepting shift is in the future
    if accepting_shift.date < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot offer past shifts"
        )

    # Update the swap
    swap.requested_shift_id = accept_data.accepting_shift_id
    swap.status = SwapStatus.ACCEPTED
    db.commit()

    # Create notification for the requester
    requester_employee = db.query(Employee).filter(
        Employee.id == requester_shift.employee_id
    ).first()
    if requester_employee and requester_employee.user_id:
        create_notification(
            db,
            requester_employee.user_id,
            f"{employee.first_name} {employee.last_name} accepted your swap request. Awaiting manager approval.",
            NotificationType.SWAP_REQUESTED
        )
        db.commit()

    # Reload with relationships
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap.id).first()

    return swap


@router.post("/{swap_id}/cancel", response_model=ShiftSwapResponse)
async def cancel_shift_swap(
    swap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cancel a swap request. Only the requester can cancel."""
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift)
    ).filter(ShiftSwap.id == swap_id).first()

    if not swap:
        raise HTTPException(status_code=404, detail="Shift swap not found")

    if swap.status not in [SwapStatus.PENDING, SwapStatus.ACCEPTED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only cancel pending or accepted swap requests"
        )

    # Verify current user owns the requester shift
    employee = get_employee_for_user(db, current_user.id)
    if not employee or swap.requester_shift.employee_id != employee.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requester can cancel this swap"
        )

    swap.status = SwapStatus.CANCELLED
    db.commit()

    # Reload with relationships
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap.id).first()

    return swap


@router.post("/{swap_id}/approve", response_model=ShiftSwapResponse)
async def approve_shift_swap(
    swap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """
    Approve a swap request (manager/admin only).

    This executes the swap by exchanging the employee_ids on both shifts.
    """
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap_id).first()

    if not swap:
        raise HTTPException(status_code=404, detail="Shift swap not found")

    if swap.status != SwapStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only approve accepted swap requests"
        )

    if not swap.requested_shift_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Swap must have an accepted shift before approval"
        )

    # Execute the swap - exchange employee IDs
    requester_shift = swap.requester_shift
    requested_shift = swap.requested_shift

    requester_employee_id = requester_shift.employee_id
    requested_employee_id = requested_shift.employee_id

    # Swap the employees
    requester_shift.employee_id = requested_employee_id
    requested_shift.employee_id = requester_employee_id

    # Update swap status
    swap.status = SwapStatus.APPROVED
    swap.approved_by = current_user.id
    swap.approved_at = datetime.utcnow()

    db.commit()

    # Create notifications for both employees
    requester_employee = db.query(Employee).filter(
        Employee.id == requester_employee_id
    ).first()
    requested_employee = db.query(Employee).filter(
        Employee.id == requested_employee_id
    ).first()

    if requester_employee and requester_employee.user_id:
        create_notification(
            db,
            requester_employee.user_id,
            f"Your shift swap has been approved! Check your updated schedule.",
            NotificationType.SWAP_APPROVED
        )

    if requested_employee and requested_employee.user_id:
        create_notification(
            db,
            requested_employee.user_id,
            f"Your shift swap has been approved! Check your updated schedule.",
            NotificationType.SWAP_APPROVED
        )

    db.commit()

    # Reload with relationships
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap.id).first()

    return swap


@router.post("/{swap_id}/deny", response_model=ShiftSwapResponse)
async def deny_shift_swap(
    swap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Deny a swap request (manager/admin only)."""
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap_id).first()

    if not swap:
        raise HTTPException(status_code=404, detail="Shift swap not found")

    if swap.status not in [SwapStatus.PENDING, SwapStatus.ACCEPTED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only deny pending or accepted swap requests"
        )

    swap.status = SwapStatus.DENIED
    swap.approved_by = current_user.id
    swap.approved_at = datetime.utcnow()

    db.commit()

    # Create notifications for involved employees
    requester_shift = swap.requester_shift
    if requester_shift and requester_shift.employee:
        employee = requester_shift.employee
        if employee.user_id:
            create_notification(
                db,
                employee.user_id,
                f"Your shift swap request has been denied.",
                NotificationType.SWAP_DENIED
            )
            db.commit()

    # Reload with relationships
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap.id).first()

    return swap


@router.patch("/{swap_id}", response_model=ShiftSwapResponse)
async def update_shift_swap(
    swap_id: int,
    swap_data: ShiftSwapUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """
    Update swap status directly (manager/admin only).

    Use POST /approve or /deny for the recommended workflow.
    """
    swap = db.query(ShiftSwap).filter(ShiftSwap.id == swap_id).first()
    if not swap:
        raise HTTPException(status_code=404, detail="Shift swap not found")

    if swap.status not in [SwapStatus.PENDING, SwapStatus.ACCEPTED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only update pending or accepted swap requests"
        )

    if swap_data.status == SwapStatus.APPROVED:
        # Use the approve endpoint for proper swap execution
        return await approve_shift_swap(swap_id, db, current_user)

    swap.status = swap_data.status
    if swap_data.status in [SwapStatus.APPROVED, SwapStatus.DENIED]:
        swap.approved_by = current_user.id
        swap.approved_at = datetime.utcnow()

    db.commit()

    # Reload with relationships
    swap = db.query(ShiftSwap).options(
        joinedload(ShiftSwap.requester_shift).joinedload(Shift.employee),
        joinedload(ShiftSwap.requested_shift).joinedload(Shift.employee)
    ).filter(ShiftSwap.id == swap.id).first()

    return swap
