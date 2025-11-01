// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
// ============================================================================
// Retrieval Engine Types (JSDoc only)
// ----------------------------------------------------------------------------
// Shared typedefs used across the retrieval engine. Keep this file dependency-
// free so it can be imported anywhere without side-effects.
// ============================================================================

/**
 * @typedef {Object} Document
 * @property {string} id
 * @property {string} title
 * @property {string=} url
 * @property {number=} createdAt
 * @property {number=} updatedAt
 * @property {string=} language
 * @property {string[]=} headings
 * @property {string=} text
 * @property {number=} sizeBytes
 * @property {('page'|'note'|'history'|'download'|'bookmark')} sourceKind
 * @property {Object<string, any>=} extra
 */

/**
 * @typedef {Object} Chunk
 * @property {string} id
 * @property {string} docId
 * @property {string=} heading
 * @property {string} content
 * @property {number} sizeChars
 * @property {number=} index
 */

/**
 * @typedef {Object} Summary
 * @property {string} id
 * @property {string} refId      // doc/section/chunk id
 * @property {('global'|'section'|'chunk')} kind
 * @property {string} text
 * @property {string[]} keyTerms
 * @property {string[]} entities
 */

/**
 * @typedef {Object} Index
 * @property {string} key
 * @property {{ url?: string, title?: string, language?: string, createdAt: number, contentHash: string }} meta
 * @property {{ heading: string, level: number, chunkIds: string[] }[]} toc
 * @property {Summary[]} summaries
 * @property {{ id: string, heading: string, chunkIds: string[] }[]} sections
 */

/**
 * @typedef {Object} RetrievalCandidate
 * @property {string} refId
 * @property {number} score
 * @property {Summary=} summary
 */

/**
 * @typedef {Object} RerankResult
 * @property {string[]} refIds
 * @property {string=} rationale
 */

/**
 * @typedef {Object} Evidence
 * @property {Chunk} chunk
 * @property {Document} doc
 */

/**
 * @typedef {Object} Answer
 * @property {string} text
 * @property {('low'|'medium'|'high')} confidence
 * @property {{ docId: string, chunkId: string, heading?: string }[]} usedRefs
 * @property {string[]=} disclaimers
 */

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {};
}


