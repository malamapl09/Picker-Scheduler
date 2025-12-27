from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.store import Store
from app.schemas.store import StoreCreate, StoreUpdate, StoreResponse
from app.api.deps import require_admin, require_manager_or_admin

router = APIRouter()


@router.get("/", response_model=List[StoreResponse])
async def list_stores(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all stores."""
    stores = db.query(Store).offset(skip).limit(limit).all()
    return stores


@router.get("/{store_id}", response_model=StoreResponse)
async def get_store(store_id: int, db: Session = Depends(get_db)):
    """Get a specific store by ID."""
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.post("/", response_model=StoreResponse, dependencies=[Depends(require_admin)])
async def create_store(store_data: StoreCreate, db: Session = Depends(get_db)):
    """Create a new store (admin only)."""
    # Check if store code already exists
    existing = db.query(Store).filter(Store.code == store_data.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Store code already exists"
        )

    store = Store(**store_data.model_dump())
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@router.patch("/{store_id}", response_model=StoreResponse, dependencies=[Depends(require_admin)])
async def update_store(
    store_id: int,
    store_data: StoreUpdate,
    db: Session = Depends(get_db)
):
    """Update a store (admin only)."""
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    update_data = store_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(store, field, value)

    db.commit()
    db.refresh(store)
    return store


@router.delete("/{store_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_store(store_id: int, db: Session = Depends(get_db)):
    """Delete a store (admin only)."""
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    db.delete(store)
    db.commit()
