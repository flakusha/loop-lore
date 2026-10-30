// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Co-owner management modal and owners-list state. */
export interface ChatCoreOwnersState {
  _ownershipModalOpen: boolean;
  _ownershipNewOwnerId: string;
  _ownershipReason: string;
  _ownershipSubmitting: boolean;
  _ownershipError: string;
  _owners: string[];
  _ownersLoading: boolean;
  _ownersError: string;
  _addOwnerModalOpen: boolean;
  _addOwnerId: string;
  _addOwnerReason: string;
  _addOwnerSubmitting: boolean;
  _addOwnerError: string;
  _removeOwnerModalOpen: boolean;
  _removeOwnerId: string;
  _removeOwnerReason: string;
  _removeOwnerSubmitting: boolean;
  _removeOwnerError: string;
  _removeOwnerResign: boolean;
}
