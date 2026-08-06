import { createAnnotationStore } from '../static/annotationStore.js';
import { suite, test, assert, assertEqual } from './harness.js';

suite('annotationStore');

test('create() places an annotation in an implicitly created group', () => {
  const store = createAnnotationStore();
  const annotation = store.create();

  assertEqual(store.getGroups().length, 1);
  assertEqual(store.getGroups()[0].annotations[0], annotation);
  assertEqual(store.getCurrentGroup(), store.getGroups()[0]);
});

test('groups and annotations are given sequential default names', () => {
  const store = createAnnotationStore();
  assertEqual(store.createGroup().name, 'Group 1');
  assertEqual(store.createGroup().name, 'Group 2');

  const group = store.setCurrentGroup(store.getGroups()[0].id);
  assertEqual(store.create().name, 'Annotation 1');
  assertEqual(store.create().name, 'Annotation 2');

  // Numbering counts within a group, not across the document.
  store.setCurrentGroup(store.getGroups()[1].id);
  assertEqual(store.create().name, 'Annotation 1');
  assertEqual(group.annotations.length, 2);
});

test('setCurrentGroup clears a current annotation belonging to another group', () => {
  const store = createAnnotationStore();
  const annotation = store.create();
  store.setCurrent(annotation.id);

  store.setCurrentGroup(store.createGroup().id);
  assertEqual(store.getCurrent(), null);
});

test('setCurrentGroup keeps a current annotation belonging to that group', () => {
  const store = createAnnotationStore();
  const annotation = store.create();
  const group = store.getCurrentGroup();
  store.setCurrent(annotation.id);

  store.setCurrentGroup(group.id);
  assertEqual(store.getCurrent(), annotation);
});

test('setCurrentGroup rejects an unknown group', () => {
  const store = createAnnotationStore();
  assertEqual(store.setCurrentGroup('missing'), null);
});

test('create accepts an explicit id, name and body', () => {
  const store = createAnnotationStore();
  const group = store.createGroup({ id: 'g1', name: 'Imported' });
  const annotation = store.create({ id: 'a1', name: 'egypt', body: 'notes', groupId: 'g1' });

  assertEqual(group.name, 'Imported');
  assertEqual(annotation.id, 'a1');
  assertEqual(annotation.name, 'egypt');
  assertEqual(annotation.body, 'notes');
  assertEqual(annotation.outlines.length, 0);
});

test('create targets a named group without making it current', () => {
  const store = createAnnotationStore();
  const first = store.createGroup();
  store.setCurrentGroup(first.id);
  const other = store.createGroup();

  store.create({ groupId: other.id });
  assertEqual(store.getCurrentGroup(), first);
  assertEqual(first.annotations.length, 0);
  assertEqual(other.annotations.length, 1);
});

test('setCurrent rejects an unknown annotation and keeps the selection', () => {
  const store = createAnnotationStore();
  const annotation = store.create();
  store.setCurrent(annotation.id);

  assertEqual(store.setCurrent('missing'), null);
  assertEqual(store.getCurrent(), annotation);
});

test('names and bodies can be edited, and unknown ids are ignored', () => {
  const store = createAnnotationStore();
  const annotation = store.create();
  const group = store.getCurrentGroup();

  store.setGroupName(group.id, 'Chest');
  store.setName(annotation.id, 'Aorta');
  store.setBody(annotation.id, 'the largest artery');

  assertEqual(group.name, 'Chest');
  assertEqual(annotation.name, 'Aorta');
  assertEqual(annotation.body, 'the largest artery');

  // No-ops rather than errors, so a stale id from the panel cannot break the store.
  store.setGroupName('missing', 'x');
  store.setName('missing', 'x');
  store.setBody('missing', 'x');
  assertEqual(group.name, 'Chest');
  assertEqual(annotation.name, 'Aorta');
});

test('setCurrent switches the current group to the annotation owner', () => {
  const store = createAnnotationStore();
  store.create();
  const other = store.createGroup();
  const annotation = store.create({ groupId: other.id });

  store.setCurrent(annotation.id);
  assertEqual(store.getCurrentGroup(), other);
});

test('getVisibleAnnotations returns only the current group', () => {
  const store = createAnnotationStore();
  assertEqual(store.getVisibleAnnotations().length, 0);

  const first = store.create();
  const second = store.createGroup();
  store.create({ groupId: second.id });

  assertEqual(store.getVisibleAnnotations().length, 1);
  assertEqual(store.getVisibleAnnotations()[0], first);
});

test('ensureCurrent creates an annotation only when none is selected', () => {
  const store = createAnnotationStore();
  const created = store.ensureCurrent();

  assertEqual(store.ensureCurrent(), created);
  assertEqual(store.getGroups()[0].annotations.length, 1);
});

test('removeAnnotation clears the selection when the removed one was current', () => {
  const store = createAnnotationStore();
  const annotation = store.create();
  store.setCurrent(annotation.id);

  assertEqual(store.removeAnnotation(annotation.id), annotation);
  assertEqual(store.getCurrent(), null);
  assertEqual(store.removeAnnotation('missing'), null);
});

test('removeGroup selects a neighbouring group', () => {
  const store = createAnnotationStore();
  const first = store.createGroup();
  const second = store.createGroup();
  const third = store.createGroup();
  store.setCurrentGroup(second.id);

  store.removeGroup(second.id);
  assertEqual(store.getCurrentGroup(), third);

  // Removing the last group falls back to the one before it.
  store.setCurrentGroup(third.id);
  store.removeGroup(third.id);
  assertEqual(store.getCurrentGroup(), first);

  store.removeGroup(first.id);
  assertEqual(store.getCurrentGroup(), null);
});

test('removeGroup leaves the selection alone when another group goes', () => {
  const store = createAnnotationStore();
  const first = store.createGroup();
  const second = store.createGroup();
  store.setCurrentGroup(first.id);
  const annotation = store.create();
  store.setCurrent(annotation.id);

  store.removeGroup(second.id);
  assertEqual(store.getCurrentGroup(), first);
  assertEqual(store.getCurrent(), annotation, 'the selected annotation should survive');
});

test('removeGroup rejects an unknown group', () => {
  const store = createAnnotationStore();
  store.createGroup();
  assertEqual(store.removeGroup('missing'), null);
  assertEqual(store.getGroups().length, 1);
});

test('removeGroup takes its annotations with it', () => {
  const store = createAnnotationStore();
  const annotation = store.create();
  const group = store.getCurrentGroup();

  store.removeGroup(group.id);
  assertEqual(store.getVisibleAnnotations().length, 0);
  assertEqual(store.removeAnnotation(annotation.id), null, 'the annotation is gone with the group');
});

test('removing another annotation leaves the current one selected', () => {
  const store = createAnnotationStore();
  const first = store.create();
  const second = store.create();
  store.setCurrent(second.id);

  store.removeAnnotation(first.id);
  assertEqual(store.getCurrent(), second);
  assertEqual(store.getVisibleAnnotations().length, 1);
});

test('ensureCurrent makes a new annotation after the current one is removed', () => {
  const store = createAnnotationStore();
  const first = store.ensureCurrent();
  store.removeAnnotation(first.id);

  const second = store.ensureCurrent();
  assert(second !== first, 'a replacement should be created');
  assertEqual(store.getVisibleAnnotations().length, 1);
  assertEqual(store.getGroups().length, 1, 'the empty group is reused');
});

test('outlines can be added, found, updated and removed', () => {
  const store = createAnnotationStore();
  const annotation = store.create();
  store.addOutline(annotation.id, { id: 'o1', points: [], normals: [], view: null });

  assert(store.findOutline(annotation.id, 'o1'), 'outline should be found');
  store.setOutlineView(annotation.id, 'o1', { camera: 'saved' });
  assertEqual(store.findOutline(annotation.id, 'o1').view.camera, 'saved');

  assertEqual(store.removeOutline(annotation.id, 'o1').id, 'o1');
  assertEqual(store.findOutline(annotation.id, 'o1'), null);
  assertEqual(store.removeOutline(annotation.id, 'o1'), null);
});

test('outline lookups on a missing annotation are safe', () => {
  const store = createAnnotationStore();
  const annotation = store.create();

  assertEqual(store.findOutline('missing', 'o1'), null);
  assertEqual(store.removeOutline('missing', 'o1'), null);
  assertEqual(store.findOutline(annotation.id, 'missing'), null);

  // Setting a view on an outline that is not there must not throw.
  store.setOutlineView(annotation.id, 'missing', { camera: 'saved' });
  assertEqual(annotation.outlines.length, 0);
});

test('outlines are kept per annotation, in the order they were drawn', () => {
  const store = createAnnotationStore();
  const first = store.create();
  const second = store.create();

  store.addOutline(first.id, { id: 'o1', points: [], normals: [], view: null });
  store.addOutline(first.id, { id: 'o2', points: [], normals: [], view: null });
  store.addOutline(second.id, { id: 'o3', points: [], normals: [], view: null });

  assertEqual(first.outlines.map((o) => o.id).join(','), 'o1,o2');
  assertEqual(second.outlines.length, 1);
  assertEqual(store.findOutline(second.id, 'o1'), null, 'outlines do not leak between annotations');

  store.removeOutline(first.id, 'o1');
  assertEqual(first.outlines.map((o) => o.id).join(','), 'o2');
});

test('getExportData strips the live drawing group from every outline', () => {
  const store = createAnnotationStore();
  const annotation = store.create();
  store.addOutline(annotation.id, {
    id: 'o1',
    points: [{ x: 0, y: 0, z: 0 }],
    normals: [{ x: 0, y: 1, z: 0 }],
    view: null,
    group: { threeObject: true },
  });

  const outline = store.getExportData().groups[0].annotations[0].outlines[0];
  assert(!('group' in outline), 'the three.js group should not be exported');
  assertEqual(outline.id, 'o1');
  assertEqual(outline.points.length, 1);
});

test('exported data is serialisable and detached from the store', () => {
  const store = createAnnotationStore();
  store.create();

  const data = store.getExportData();
  assert(JSON.stringify(data).length > 0, 'export should serialise');

  data.settings.bgColor = '#ffffff';
  assertEqual(store.getSettings().bgColor, '#000000');
});

test('getExportData preserves the group and annotation structure', () => {
  const store = createAnnotationStore();
  const chest = store.createGroup({ name: 'Chest' });
  store.create({ name: 'Aorta', body: 'notes', groupId: chest.id });
  const head = store.createGroup({ name: 'Head' });
  store.create({ groupId: head.id });
  store.setSetting('bgColor', '#123456');

  const data = JSON.parse(JSON.stringify(store.getExportData()));

  assertEqual(data.groups.length, 2);
  assertEqual(data.groups[0].name, 'Chest');
  assertEqual(data.groups[0].annotations[0].name, 'Aorta');
  assertEqual(data.groups[0].annotations[0].body, 'notes');
  assertEqual(data.groups[1].name, 'Head');
  assertEqual(data.settings.bgColor, '#123456');
});

test('settings hold document-level state', () => {
  const store = createAnnotationStore();
  assertEqual(store.getSettings().outlineColor, '#2563eb');
  assertEqual(store.getSettings().homeView, null);

  store.setSetting('homeView', { saved: true });
  assertEqual(store.getSettings().homeView.saved, true);
});
