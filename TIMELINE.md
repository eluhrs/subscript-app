# Subscript Project Timeline

This timeline chronicles the development history of the Subscript project, including major feature additions, architectural shifts, and security updates.

## Pre-Git History (Before 2025-11-23)
**Subscript v1.0 (Legacy Slicing Architecture)**: The initial prototype phase of Subscript relied on a "slicing" approach. The development team eventually pivoted to a full-page processing architecture, prompting the codebase reboot in Subscript 2.0.

---

## 2025-11-23
**Initial Commit (`8c97814`)**: Established the new Git repository for the project.

## 2025-11-26
**Subscript 2.0 Infrastructure (`3805915`)**: Phase 1 of the new architecture started, focusing on the infrastructure setup for full-page processing.
**Legacy State Preservation (`7597997`)**: Saved legacy v1 slicing architecture code for historical reference before clearing it out.

## 2025-11-27
**Kraken & Gemini Integration (`fc720a9`)**: Phase 2 introduced Kraken for text segmentation and Gemini for visual tagging.
**CLI Refinements & Multi-Model (`a92414c`)**: Phase 3 added multi-model processing support to the CLI.
**PDF Combination (`da8d984`)**: Phase 4 implemented the ability to combine generated outputs into a single PDF.

## 2025-11-29
**Multi-Provider Support (`54b7195`)**: Major refactor allowing for multiple LLM providers beyond Gemini, improving configuration and documentation.

## 2025-12-03
**Python Packaging (`0f2fe67`)**: Subscript was packaged for standard installation via `pip`.

## 2025-12-04
**Web App Launch (`633d1e7`)**: Introduced the dockerized Web Application, featuring a React frontend and FastAPI backend.
**JWT & Celery (`1724422`, `42aaff7`)**: Added JWT Authentication for secure access and Integrated Celery for asynchronous background processing of documents.
**Document Management Refining (`aa8fe4a` - `da332f8`)**: Extensive improvements to upload/download logic, thumbnail generation, multi-user storage based on emails, and file cleanup mechanisms.

## 2025-12-06
**Bi-Directional Page Editor (`1f6d2c2`)**: Initial rollout of the 50/50 layout editor.

## 2025-12-07
**Editor Integration Finalized (`a09711c`, `ba98fcb`)**: nw-page-editor integrated seamlessly with robust synchronization, updating TXT transcripts upon save.

## 2025-12-09
**Multi-Page Uploads (`45011cc`, `af10406`)**: Added support for multi-page and multi-file batch uploads and merging them into a combined PDF.

## 2025-12-10
**Admin & User Management UI (`1a98f0b`)**: First admin logic introduced, including user management in the profile tab and UI theme styling.

## 2025-12-11
**Session Safety & Dash Polish (`c5a03ea`, `fc038cb`)**: Implemented session expiration handling, share links, and finalized the specific "Dashboard Polish" state.

## 2025-12-13
**Per-Model Persistence (`eaf441d`, `5ac296f`)**: Added server-side preferences to retain prompt, temperature, and advanced layout options on a per-model basis.
**Bulk Actions (`f31b68d`, `099cd5e`)**: Deployed bulk metadata actions like bulk download and bulk delete with confirmation modals.

## 2025-12-15
**Security Audit & Hardening (`6777bfb`, `d7d7d7d`)**: Significant security hardening and configuration updates. App, editor, and worker containers were reconfigured to run as a non-root user (UID 5000) for improved process isolation.

## 2025-12-20
**LDAP Authentication (`fd8714a`)**: Implemented Hybrid LDAP Authentication with Just-In-Time (JIT) provisioning.
**Onboarding App Tour (`44fb7d3`)**: Added app tour slides and sample documents for new user logins.

## 2025-12-21
**Access Restrictions & Rate Limiting (`9cd4278`, `3686c18`)**: Added restricted access mode, UFW/Nginx rate limiting awareness, and strong password enforcements.

## 2025-12-23
**Subscript Version Bumps (`ae0c613`, `dd7c745`)**: Updated underlying submodule to use Subscript `v1.3.0` and `v1.4.1` for production. Switched default LLM to Gemini Flash 3.

## 2026-01-13
**Scalable Batch Uploading (`9b4fd69`)**: Implemented a scalable batch uploading feature splitting frontend chunking with backend handling to bypass payload limits.

## 2026-01-14
**Refactored Batch Merging (`02a3a50`)**: Shifted document merging to use `pypdf` directly inside `tasks.py` for increased robustness and stability.
