"""Compliance checker and audit-trail routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from . import audit, compliance
from .common import audit_block, error, internal_error, logger, read_json, validate

router = APIRouter()


@router.post("/compliance/check")
async def compliance_check(request: Request) -> Any:
    body, err = await read_json(request)
    if err:
        return err
    req, err = validate(compliance.ComplianceRequest, body)
    if err:
        return err
    try:
        out = compliance.check(req)
        rec = audit.record("compliance/check", req.model_dump(by_alias=True), None, {"path": "rules"},
                           {"score": out["score"]})
    except Exception:
        logger.exception("compliance check failed")
        return internal_error()
    return {**out, "audit": audit_block(rec)}


@router.get("/audit/{audit_id}")
async def get_audit(audit_id: str) -> Any:
    rec = audit.store.get(audit_id)
    if rec is None:
        return error(404, ["Audit record not found; it may have expired from the in-memory trail"], "not_found")
    return rec


@router.post("/audit/export")
async def export_audit(request: Request) -> Any:
    from .security import authenticate

    _, err = authenticate(request)  # optional JWT: anonymous allowed, invalid token rejected
    if err:
        return err
    body, err = await read_json(request, allow_empty=True)
    if err:
        return err
    ids = None
    if isinstance(body, dict) and "ids" in body:
        ids = body["ids"]
        if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids) or len(ids) > 1000:
            return error(400, ["'ids' must be a list of up to 1000 audit ID strings"])
    elif body not in ({}, None):
        return error(400, ["Request body must be a JSON object, optionally with an 'ids' list"])
    return audit.export(ids)
