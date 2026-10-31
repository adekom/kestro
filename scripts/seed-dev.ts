/**
 * Replaces local development data with a realistic sample data set.
 *
 *   npm run seed:dev
 *
 * Runs only against the Firebase Emulator Suite (a "demo-" project). It keeps
 * staff accounts, organization settings and the logo, and deletes every
 * project, report, observation, photo and non-staff contact.
 */
import { bucket, db } from "@/server/firebaseAdmin";
import { contactsCol, photoSharesCol, projectsCol, usersCol } from "@/server/paths";
import { createContact } from "@/server/services/contacts";
import { addProjectContacts, createProject, getProject, saveGroups, setProjectArchived } from "@/server/services/projects";
import { addMemberships, carryForwardCandidates, createReport, getMemberships, updateReportInfo } from "@/server/services/reports";
import { addUpdate, createObservation, setStatusInReport } from "@/server/services/observations";
import { getSettings } from "@/server/services/settings";
import { addUser } from "@/server/services/users";
import { contactName } from "@/lib/domain";
import type { AppUser, Attendee, Contact } from "@/lib/types";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId.startsWith("demo-")) {
  console.error("Refusing to run: seed:dev only works against the local emulators (a demo- project).");
  process.exit(1);
}

type S = "open" | "progress" | "resolved";
interface Step {
  update?: string;
  status?: S;
}
interface ObsSpec {
  at: number;
  group?: string;
  title: string;
  description: string;
  status: S;
  later?: Record<number, Step>;
}
interface Visit {
  date: string;
  time: string;
  author: string;
  ongoing: string;
  absent?: string[];
}
interface ProjectSpec {
  name: string;
  code: string;
  address: string;
  description: string;
  groups: string[];
  contacts: Array<[email: string, role: string]>;
  visits: Visit[];
  observations: ObsSpec[];
  archived?: boolean;
}

// ---- Firm contacts (fictional) ----
const CONTACTS = [
  { firstName: "Marcus", lastName: "Reed", company: "Summit Builders", title: "Project Manager", email: "mreed@summitbuilders.example", phone: "(415) 555-0141" },
  { firstName: "Elena", lastName: "Torres", company: "Summit Builders", title: "Superintendent", email: "etorres@summitbuilders.example", phone: "(415) 555-0142" },
  { firstName: "Priya", lastName: "Shah", company: "Harborline Development", title: "Development Manager", email: "priya@harborline.example", phone: "(415) 555-0177" },
  { firstName: "Tom", lastName: "Becker", company: "Becker Structural", title: "Principal", email: "tom@beckerse.example", phone: "(510) 555-0119" },
  { firstName: "Grace", lastName: "Liu", company: "Northwind MEP", title: "Mechanical Engineer", email: "gliu@northwindmep.example", phone: "(510) 555-0163" },
  { firstName: "Daniel", lastName: "Okafor", company: "Lincoln Unified School District", title: "Facilities Director", email: "dokafor@lincolnusd.example", phone: "(650) 555-0108" },
  { firstName: "Sofia", lastName: "Martins", company: "Cascade Construction", title: "Superintendent", email: "smartins@cascadecc.example", phone: "(650) 555-0124" },
  { firstName: "Ken", lastName: "Watanabe", company: "City of Riverside", title: "Library Services Manager", email: "kwatanabe@riverside.example", phone: "(951) 555-0190" },
  { firstName: "Rachel", lastName: "Kim", company: "Cascade Construction", title: "Project Engineer", email: "rkim@cascadecc.example", phone: "(650) 555-0125" },
  { firstName: "Luis", lastName: "Alvarez", company: "Alvarez Waterproofing", title: "Owner", email: "luis@alvarezwp.example", phone: "(408) 555-0156" },
];
const STAFF = { email: "maya.chen@kestro-staff.example", firstName: "Maya", lastName: "Chen" };

const PROJECTS: ProjectSpec[] = [
  {
    name: "Harbor View Residences",
    code: "2025-014",
    address: "1200 Harbor Way, Oakland, CA",
    description: "Six-story, 84-unit residential building: five levels of wood framing over a concrete podium with ground-floor retail.",
    groups: ["Site", "Exterior", "Level 1", "Level 2", "Roof"],
    contacts: [
      ["mreed@summitbuilders.example", "General contractor – project manager"],
      ["etorres@summitbuilders.example", "General contractor – superintendent"],
      ["priya@harborline.example", "Owner's representative"],
      ["tom@beckerse.example", "Structural engineer"],
      ["gliu@northwindmep.example", "Mechanical engineer"],
      ["luis@alvarezwp.example", "Waterproofing subcontractor"],
    ],
    visits: [
      { date: "2026-06-02", time: "09:00", author: "Anton Dekom", ongoing: "Podium deck complete. Level 2 wall framing underway on the north half; sheathing and window rough openings in progress on Levels 2–3 east elevation. Site utilities trenching along Harbor Way.", absent: ["gliu@northwindmep.example", "luis@alvarezwp.example"] },
      { date: "2026-06-16", time: "09:30", author: "Anton Dekom", ongoing: "Level 3 framing complete; Level 4 floor joists being set. Window installation started on the east elevation. Fire-stopping subcontractor mobilized at Level 1 corridors.", absent: ["tom@beckerse.example"] },
      { date: "2026-07-07", time: "10:00", author: "Maya Chen", ongoing: "Framing topped out at Level 6. Roof trusses delivered and half installed. Weather-resistive barrier installation continues on south and west elevations. MEP rough-in on Levels 1–2.", absent: ["priya@harborline.example", "luis@alvarezwp.example"] },
      { date: "2026-07-28", time: "09:00", author: "Anton Dekom", ongoing: "Roof sheathing complete; membrane roofing underway. Storefront framing installed at retail. Drywall stocked on Level 1. Exterior siding started on the north elevation.", absent: ["gliu@northwindmep.example"] },
      { date: "2026-08-18", time: "13:30", author: "Maya Chen", ongoing: "Roofing substantially complete except around rooftop units. Drywall hanging on Levels 1–3; taping on Level 1. Siding at roughly 40% complete. Storefront glazing installed.", absent: ["tom@beckerse.example", "luis@alvarezwp.example"] },
      { date: "2026-09-08", time: "09:00", author: "Anton Dekom", ongoing: "Interior finishes starting on Level 1: cabinets delivered, flooring underlayment in Units 101–108. Siding at roughly 70% complete. Rooftop units set; curb flashing in progress.", absent: ["gliu@northwindmep.example", "tom@beckerse.example"] },
    ],
    observations: [
      { at: 0, group: "Site", title: "Construction fence gate left open after hours", description: "The Harbor Way gate was found open and unlocked at 8:45 am before crew arrival. Keep the site secured outside working hours.", status: "open", later: { 1: { update: "Gate now chained and locked nightly; confirmed by superintendent.", status: "resolved" } } },
      { at: 0, group: "Exterior", title: "Missing head flashing at windows, east elevation Level 2", description: "Head flashing has not been installed at eight window openings on the east elevation, Level 2. WRB is lapped directly over the window flange. Install head flashing per detail 7/A-501 before siding.", status: "open", later: { 1: { update: "Head flashing installed at 3 of 8 openings.", status: "progress" }, 2: { update: "All head flashing installed. End dams still to be verified." }, 3: { update: "End dams verified at all eight openings.", status: "resolved" } } },
      { at: 0, group: "Level 1", title: "Fire-stopping incomplete at corridor penetrations", description: "Plumbing and electrical penetrations through the 1-hour corridor walls at Level 1 lack fire-stopping. Provide a listed system for each penetration type and submit the system data sheets.", status: "open", later: { 1: { update: "Fire-stopping subcontractor mobilized; submittal received.", status: "progress" }, 3: { update: "Fire-stopping complete at Level 1; third-party inspection passed.", status: "resolved" } } },
      { at: 0, group: "Level 2", title: "Shear wall nailing does not match S-401", description: "Edge nailing at shear wall SW-3 (gridline C, Level 2) is at 6\" o.c.; the drawings require 3\" o.c. Coordinate with the structural engineer before covering.", status: "open", later: { 1: { update: "Structural engineer reviewed; additional nailing required at SW-3 and SW-4.", status: "progress" }, 2: { update: "Additional nailing installed and observed by the engineer of record.", status: "resolved" } } },
      { at: 0, group: "Roof", title: "Temporary roof drains blocked by debris", description: "Temporary drains at the podium-level roof are blocked by framing debris, causing ponding after last week's rain.", status: "open", later: { 1: { update: "Debris cleared; drain guards installed.", status: "resolved" } } },
      { at: 1, group: "Exterior", title: "Weather-resistive barrier torn at southwest corner", description: "The WRB is torn in several locations at the southwest corner, Levels 3–4, likely from wind. Repair with compatible tape or replace before siding.", status: "open", later: { 2: { update: "Repaired with manufacturer-approved tape.", status: "resolved" } } },
      { at: 1, group: "Level 1", title: "Unprotected floor openings at Stair 2", description: "Floor openings at Stair 2, Levels 2 and 3, lack guardrails or covers. This is a fall hazard; protect immediately.", status: "open", later: { 2: { update: "Guardrails installed at both levels.", status: "resolved" } } },
      { at: 2, group: "Level 2", title: "Plumbing vent conflicts with header at Unit 204", description: "A 3\" plumbing vent is routed through the window header at Unit 204. Do not notch or bore the header without the structural engineer's approval.", status: "open", later: { 3: { update: "RFI 37 issued to the design team.", status: "progress" }, 4: { update: "RFI 37 response: reroute vent through the adjacent stud bay." }, 5: { update: "Vent rerouted; header patched per the RFI sketch.", status: "resolved" } } },
      { at: 2, group: "Roof", title: "Parapet blocking height inconsistent", description: "Parapet blocking at the north parapet varies from 2x6 to 2x8 and does not provide continuous attachment for the coping as shown in detail 3/A-520.", status: "open", later: { 4: { update: "Contractor to add blocking before coping installation.", status: "progress" } } },
      { at: 3, group: "Exterior", title: "Sealant joints at storefront not tooled", description: "Perimeter sealant at the retail storefront is not tooled and shows voids at the sill corners. Remove and reinstall per specification section 07 92 00.", status: "open", later: { 4: { update: "Sealant replaced at the west storefront; east storefront remains.", status: "progress" } } },
      { at: 3, group: "Level 1", title: "Lobby ceiling height below design", description: "Framed soffit at the main lobby measures 9'-2\" AFF; the reflected ceiling plan shows 9'-8\". Verify duct routing above and confirm with the architect before drywall.", status: "open", later: { 4: { update: "Duct relocated; soffit to be reframed." } } },
      { at: 4, group: "Level 2", title: "Missing acoustic sealant at party walls, Units 201–206", description: "Acoustic sealant has not been installed at the bottom plates of the party walls between Units 201–206. Install before drywall per the STC assembly.", status: "open" },
      { at: 4, group: "Exterior", title: "Downspout not connected to storm leader", description: "The downspout at the northeast corner discharges onto grade beside the foundation; connect it to the storm leader per civil plans.", status: "open", later: { 5: { update: "Connected to storm leader.", status: "resolved" } } },
      { at: 5, group: "Roof", title: "Membrane seam lifted near roof hatch", description: "A membrane seam has lifted roughly 18\" near the roof hatch curb. Heat-weld and probe all seams within 10 feet of the hatch.", status: "open" },
      { at: 5, group: "Level 1", title: "Incorrect door hardware at Unit 101", description: "The entry door at Unit 101 has a passage lever; hardware set HW-4 requires a deadbolt and an ADA-compliant lever.", status: "open" },
      { at: 5, title: "Construction schedule not posted in site office", description: "The current three-week look-ahead schedule is not posted in the site office as required by the general conditions.", status: "open" },
    ],
  },
  {
    name: "Lincoln Elementary Modernization",
    code: "2026-003",
    address: "455 Lincoln Ave, San Mateo, CA",
    description: "Seismic upgrade and interior modernization of the 1958 classroom wings, including new accessible restrooms.",
    groups: [],
    contacts: [
      ["dokafor@lincolnusd.example", "Owner – district facilities"],
      ["smartins@cascadecc.example", "General contractor – superintendent"],
      ["rkim@cascadecc.example", "General contractor – project engineer"],
      ["tom@beckerse.example", "Structural engineer"],
    ],
    visits: [
      { date: "2026-09-03", time: "08:00", author: "Anton Dekom", ongoing: "Demolition complete in Wing B. Steel brace frame connections being drilled into existing concrete. Restroom underground plumbing trenching in progress." },
      { date: "2026-09-17", time: "08:00", author: "Maya Chen", ongoing: "Brace frames erected in Wing B; epoxy anchors installed. Restroom slab poured. Electrical demolition in Wing C.", absent: ["tom@beckerse.example"] },
      { date: "2026-10-01", time: "08:30", author: "Anton Dekom", ongoing: "Wing B framing and MEP rough-in. Wing C demolition 80% complete. Exterior window replacement started on Wing B." },
    ],
    observations: [
      { at: 0, title: "Hazardous materials survey not on site", description: "The hazardous materials survey and abatement clearance for Wing B were not available on site. Provide copies before further demolition.", status: "open", later: { 1: { update: "Clearance report posted in the site office.", status: "resolved" } } },
      { at: 0, title: "Epoxy anchor installer certification", description: "Provide the ACI/CRSI adhesive anchor installer certification for the crew installing anchors at the brace frame connections.", status: "open", later: { 1: { update: "Certifications received for two of three installers.", status: "progress" }, 2: { update: "Third certification received.", status: "resolved" } } },
      { at: 1, title: "Restroom floor slope toward drain inadequate", description: "Slab slope at the new girls' restroom floor drain measures less than 1/8\" per foot in the northwest corner. Verify before tile setting.", status: "open", later: { 2: { update: "Leveling compound applied; slope verified.", status: "resolved" } } },
      { at: 1, title: "Existing classroom clocks to be salvaged", description: "Wall clocks in Wing B classrooms were discarded. Specification 02 41 19 requires them to be salvaged and returned to the district.", status: "open", later: { 2: { update: "Contractor locating replacements; credit to be proposed.", status: "progress" } } },
      { at: 2, title: "Window sill pan flashing missing", description: "Sill pan flashing was not installed at the first two replacement windows in Wing B. Remove the windows and install pans per detail 4/A-801.", status: "open" },
    ],
  },
  {
    name: "Riverside Library Addition",
    code: "2025-022",
    address: "3581 Mission Inn Ave, Riverside, CA",
    description: "Single-story 6,000 sf reading room addition with a clerestory and connection to the existing 1965 library.",
    groups: ["Addition", "Existing building"],
    contacts: [["kwatanabe@riverside.example", "Owner – city"]],
    visits: [
      { date: "2026-08-25", time: "10:00", author: "Maya Chen", ongoing: "Foundations complete. Steel erection 60% complete. Connection to the existing building is temporarily enclosed with plywood." },
      { date: "2026-09-22", time: "10:00", author: "Maya Chen", ongoing: "Steel complete; metal deck installed. Clerestory framing underway. Existing building reroofing at the connection started." },
    ],
    observations: [
      { at: 0, group: "Existing building", title: "Temporary enclosure not weathertight", description: "The plywood enclosure at the connection to the existing building has gaps at the head. Seal before forecast rain to protect the existing collection.", status: "open", later: { 1: { update: "Enclosure resealed and inspected after rain.", status: "resolved" } } },
      { at: 0, group: "Addition", title: "Anchor bolt projection insufficient at column C-4", description: "Anchor bolt projection at column C-4 is insufficient for a full nut engagement. Coordinate a repair with the structural engineer.", status: "open", later: { 1: { update: "Coupler repair approved and installed.", status: "resolved" } } },
      { at: 1, group: "Addition", title: "Deck welds at clerestory edge incomplete", description: "Puddle welds at the deck edge along the clerestory are missing at about every third flute. Complete the welds per S-301 before special inspection.", status: "open" },
    ],
  },
  {
    name: "Oak Street Duplex",
    code: "2024-031",
    address: "88 Oak St, Berkeley, CA",
    description: "Two-unit infill residence. Construction complete; project archived.",
    groups: [],
    contacts: [["mreed@summitbuilders.example", "General contractor"]],
    archived: true,
    visits: [
      { date: "2025-11-12", time: "14:00", author: "Anton Dekom", ongoing: "Final punch walk with the owner." },
    ],
    observations: [
      { at: 0, title: "Touch-up paint at stair stringer", description: "Scuffs on the painted stair stringer in Unit A. Touch up before turnover.", status: "open" },
    ],
  },
];

async function wipe() {
  const projects = await projectsCol().get();
  for (const p of projects.docs) await db().recursiveDelete(p.ref);
  const shares = await photoSharesCol().get();
  for (const s of shares.docs) await s.ref.delete();
  const contacts = await contactsCol().get();
  for (const c of contacts.docs) if (!(c.data() as Contact).userEmail) await c.ref.delete();
  await bucket().deleteFiles({ prefix: "projects/" }).catch(() => undefined);
  console.log(`Removed ${projects.size} projects, ${shares.size} photo links and non-staff contacts.`);
}

async function main() {
  await wipe();
  const settings = await getSettings();
  const ordered = [...settings.statuses].sort((a, b) => a.order - b.order);
  const unresolved = ordered.filter((s) => s.id !== settings.resolvedStatusId);
  const statusId = { open: unresolved[0].id, progress: (unresolved[1] ?? unresolved[0]).id, resolved: settings.resolvedStatusId };

  // Contacts and a second staff member (editor).
  const byEmail = new Map<string, Contact>();
  for (const c of CONTACTS) byEmail.set(c.email, await createContact(c));
  if (!(await usersCol().doc(STAFF.email).get()).exists) {
    await addUser(STAFF.email, "editor", { firstName: STAFF.firstName, lastName: STAFF.lastName });
  }
  for (const d of (await contactsCol().get()).docs) {
    const c = d.data() as Contact;
    byEmail.set(c.email.toLowerCase(), c);
  }
  // Every admin on the staff list is a contact on the first three projects, so they appear under "My projects".
  const admins = (await usersCol().where("role", "==", "admin").get()).docs.map((d) => d.data() as AppUser);

  for (const [index, spec] of PROJECTS.entries()) {
    const entries = spec.contacts.map(([email, projectRole]) => ({ contactId: byEmail.get(email)!.id, projectRole }));
    const pid = await createProject(
      { name: spec.name, code: spec.code, address: spec.address, description: spec.description, reportPrefix: "Field Report " },
      entries,
    );
    const staffOnProject = index < 2 ? [...admins.map((a) => a.contactId), byEmail.get(STAFF.email)?.id] : [byEmail.get(STAFF.email)?.id];
    await addProjectContacts(pid, staffOnProject.filter((id): id is string => Boolean(id)).map((contactId) => ({ contactId, projectRole: "Architect – construction administration" })));
    if (spec.groups.length) await saveGroups(pid, spec.groups.map((name) => ({ name })));
    const project = await getProject(pid);
    const groupId = new Map(project.groups.map((g) => [g.name, g.id]));
    const obsIds: string[] = [];
    let previous: string | null = null;

    for (const [i, visit] of spec.visits.entries()) {
      // Carry forward exactly as the app does: unresolved observations preselected.
      const carried = previous ? (await carryForwardCandidates(pid, previous, settings.resolvedStatusId)).fromSource.filter((c) => c.preselected).map((c) => c.observationId) : [];
      const rid: string = await createReport(pid, { visitDate: visit.date, visitTime: visit.time, authorName: visit.author, sourceReportId: previous, observationIds: carried });
      const absent = new Set(visit.absent ?? []);
      const attendees: Attendee[] = project.contacts.map((pc) => {
        const c = [...byEmail.values()].find((x) => x.id === pc.contactId)!;
        return { id: crypto.randomUUID(), contactId: c.id, name: contactName(c), company: c.company, present: !absent.has(c.email) };
      });
      await updateReportInfo(pid, rid, { ongoingWork: visit.ongoing, attendees }, 1);

      for (const [n, o] of spec.observations.entries()) {
        if (o.at === i) {
          obsIds[n] = await createObservation(pid, rid, {
            title: o.title,
            description: o.description,
            statusId: statusId[o.status],
            groupId: o.group ? (groupId.get(o.group) ?? null) : null,
          });
        }
        const step = o.later?.[i];
        if (step && obsIds[n]) {
          const members = new Set((await getMemberships(pid, rid)).map((m) => m.observationId));
          if (!members.has(obsIds[n])) await addMemberships(pid, rid, [obsIds[n]]);
          if (step.update) await addUpdate(pid, obsIds[n], rid, step.update);
          if (step.status) await setStatusInReport(pid, obsIds[n], rid, statusId[step.status]);
        }
      }
      previous = rid;
    }
    if (spec.archived) await setProjectArchived(pid, true);
    console.log(`${spec.name}: ${spec.visits.length} reports, ${spec.observations.length} observations${spec.archived ? " (archived)" : ""}`);
  }
  console.log("Done.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
