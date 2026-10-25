import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {normalizePreferences,normalizeUrl,profilePayload,profileTextState} from '../../src/profile/ProfileService.js';
import {profileMediaKind,profileMediaState,validateProfileImage} from '../../src/profile/ProfileMediaService.js';
test('wanted preferences win over conflicting unwanted preferences',()=>{assert.deepEqual(normalizePreferences({wantedGenres:['1','2'],unwantedGenres:['2','3'],wantedTopics:['8'],unwantedTopics:['8','9']}),{wantedGenres:[1,2],unwantedGenres:[3],wantedTopics:[8],unwantedTopics:[9]});});
test('profile links only accept http protocols',()=>{assert.equal(normalizeUrl('https://example.com/a'),'https://example.com/a');assert.throws(()=>normalizeUrl('javascript:alert(1)'),/HTTP/);});
test('profile payload is structured and bounded',()=>{const form=new FormData();form.set('nickname','Mira');form.set('username','@mira');form.set('bio','bio');form.set('interests','Кино, История');const value=profilePayload(form);assert.equal(value.username,'mira');assert.deepEqual(value.interests,['Кино','История']);});
test('identity migration enables RLS and normalized preference uniqueness',()=>{const sql=fs.readFileSync('supabase/migrations/202610040001_identity_discovery.sql','utf8');for(const table of ['lit_genres','lit_topics','lit_profile_genre_preferences','lit_profile_topic_preferences','lit_profile_favorite_books','lit_profile_social_links'])assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));assert.match(sql,/primary key \(user_id,genre_id\)/);assert.match(sql,/lit_replace_my_profile_details/);});
test('explicitly removed media stays removed when server profile is reloaded',()=>{
  const fallback={avatarPath:'old/avatar.webp',avatarUrl:'https://old/avatar.webp',bannerPath:'old/banner.webp',bannerUrl:'https://old/banner.webp'};
  const media=profileMediaState({avatar_path:null,banner_path:null},fallback,()=>assert.fail('removed media should not resolve URLs'));
  assert.deepEqual(media,{avatarPath:'',avatarUrl:'',bannerPath:'',bannerUrl:''});
});
test('profile media resolves persistent server paths and validates supported kinds',()=>{
  assert.deepEqual(profileMediaKind('banner'),{bucket:'lit-profile-banners',column:'banner_path'});
  assert.throws(()=>profileMediaKind('unknown'),/Неизвестный/);
  const media=profileMediaState({avatar_path:'user/new.webp'}, {},(bucket,path)=>`${bucket}/${path}`);
  assert.equal(media.avatarUrl,'lit-avatars/user/new.webp');
  assert.throws(()=>validateProfileImage({type:'image/svg+xml',size:40}),/JPEG/);
  assert.throws(()=>validateProfileImage({type:'image/webp',size:5_242_881},5_242_880),/меньше/);
});
test('cleared text fields remain cleared instead of falling back to cached values',()=>{
  assert.deepEqual(profileTextState({first_name:'',last_name:'',bio:'',current_status:''},{firstName:'old',lastName:'old',bio:'old',currentStatus:'old'}),{firstName:'',lastName:'',bio:'',currentStatus:''});
  assert.equal(profileTextState({first_name:null},{firstName:'old'}).firstName,'');
});
