# TASK: Neighborhood & Housing Customization System

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-housing-base-building
**Tags:** housing, neighborhood, customization, social, decoration

## Description

Add neighborhood and advanced housing customization mechanics to the Housing & Base Building epic — players can form neighborhoods, visit each other's homes, and participate in housing decoration contests. Extends the housing system from isolated player homes to a social, community-driven experience.

## How It Extends Existing Work

Builds on the Housing & Base Building epic's room system, construction, decoration, and visitor log. Adds neighborhood-level social mechanics and decoration competitions on top of the existing housing infrastructure.

## Acceptance Criteria

- [ ] Neighborhood creation (cluster of player houses in a region)
- [ ] Neighborhood shared spaces (park, market, meeting hall)
- [ ] Housing decoration contest system (seasonal themes, voting, prizes)
- [ ] Neighbor visit system (walk through neighbor's home)
- [ ] Neighborhood reputation (community score, decorations, events)
- [ ] `GET/POST/PUT/DELETE /api/housing/neighborhoods` routes
- [ ] `GET /api/housing/:id/visitors` — visitor log
- [ ] `POST /api/housing/contests` — create/join a decoration contest
- [ ] Frontend neighborhood map with house icons
- [ ] Frontend decoration contest panel with voting
- [ ] Frontend visitor walkthrough mode

## Technical Notes

- Neighborhoods are region-based clusters of player housing records
- Decoration contests use a voting system stored per contest entry
- Visitor walkthrough uses the existing scene rendering pipeline with restricted interaction
- Integrates with Social Interaction epic for neighbor relationships
