import Data from './input_structure'
import {compileJSON, IO} from './util'

import {Config} from './emitter'
import { MathUtils } from 'three';


//Textures
class Texture {
	constructor(data, uuid) {
		var scope = this;
		//Info
		for (var key in Texture.properties) {
			Texture.properties[key].reset(this);
		}
		//meta
		this.source = ''
		this.selected = false
		this.multi_selected = false
		this.show_icon = true
		this.error = 0;
		this.visible = true;
		this.source_overwritten = false;
		//Data
		this.img = 0;
		this.width = 0;
		this.height = 0;
		this.uv_width = Project ? Project.texture_width : 16;
		this.uv_height = Project ? Project.texture_height : 16;
		this.currentFrame = 0;
		this.saved = true;
		this.layers = [];
		this.layers_enabled = false;
		this.selected_layer = null;
		this.internal = !isApp;
		this.uuid = uuid || guid()
		this.flags = new Set();

		this._static = Object.freeze({
			properties: {
				selection: new IntMatrix(0, 0)
			}
		});

		//Setup Img/Mat
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.canvas.height = 16;
		this.ctx = this.canvas.getContext('2d', {willReadFrequently: true});
		let img = this.img = new Image()
		img.src = 'assets/missing.png'

		var tex = new THREE.Texture(this.canvas);
		tex.magFilter = THREE.NearestFilter
		tex.minFilter = THREE.NearestFilter
		tex.name = this.name;
		img.tex = tex;

		var vertShader = `
			attribute float highlight;

			uniform bool SHADE;
			uniform int LIGHTSIDE;

			varying vec2 vUv;
			varying float light;
			varying float lift;

			float AMBIENT = 0.5;
			float XFAC = -0.15;
			float ZFAC = 0.05;

			void main()
			{

				if (SHADE) {

					vec3 N = normalize( vec3( modelMatrix * vec4(normal, 0.0) ) );

					if (LIGHTSIDE == 1) {
						float temp = N.y;
						N.y = N.z * -1.0;
						N.z = temp;
					}
					if (LIGHTSIDE == 2) {
						float temp = N.y;
						N.y = N.x;
						N.x = temp;
					}
					if (LIGHTSIDE == 3) {
						N.y = N.y * -1.0;
					}
					if (LIGHTSIDE == 4) {
						float temp = N.y;
						N.y = N.z;
						N.z = temp;
					}
					if (LIGHTSIDE == 5) {
						float temp = N.y;
						N.y = N.x * -1.0;
						N.x = temp;
					}

					float yLight = (1.0+N.y) * 0.5;
					light = yLight * (1.0-AMBIENT) + N.x*N.x * XFAC + N.z*N.z * ZFAC + AMBIENT;

				} else {

					light = 1.0;

				}

				if (highlight == 2.0) {
					lift = 0.22;
				} else if (highlight == 1.0) {
					lift = 0.1;
				} else {
					lift = 0.0;
				}
				
				vUv = uv;
				vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
				gl_Position = projectionMatrix * mvPosition;
			}`
		var fragShader = `
			#ifdef GL_ES
			precision ${isApp ? 'highp' : 'mediump'} float;
			#endif

			uniform sampler2D map;

			uniform bool SHADE;
			uniform bool EMISSIVE;
			uniform vec3 LIGHTCOLOR;

			varying vec2 vUv;
			varying float light;
			varying float lift;

			void main(void)
			{
				vec4 color = texture2D(map, vUv);
				
				if (color.a < 0.01) discard;

				if (EMISSIVE == false) {

					gl_FragColor = vec4(lift + color.rgb * light, color.a);
					gl_FragColor.r = gl_FragColor.r * LIGHTCOLOR.r;
					gl_FragColor.g = gl_FragColor.g * LIGHTCOLOR.g;
					gl_FragColor.b = gl_FragColor.b * LIGHTCOLOR.b;

				} else {

					float light_r = (light * LIGHTCOLOR.r) + (1.0 - light * LIGHTCOLOR.r) * (1.0 - color.a);
					float light_g = (light * LIGHTCOLOR.g) + (1.0 - light * LIGHTCOLOR.g) * (1.0 - color.a);
					float light_b = (light * LIGHTCOLOR.b) + (1.0 - light * LIGHTCOLOR.b) * (1.0 - color.a);
					gl_FragColor = vec4(lift + color.r * light_r, lift + color.g * light_g, lift + color.b * light_b, 1.0);

				}

				if (lift > 0.2) {
					gl_FragColor.r = gl_FragColor.r * 0.6;
					gl_FragColor.g = gl_FragColor.g * 0.7;
				}
			}`
		var mat = new THREE.ShaderMaterial({
			uniforms: {
				map: {type: 't', value: tex},
				SHADE: {type: 'bool', value: settings.shading.value},
				LIGHTCOLOR: {type: 'vec3', value: new THREE.Color().copy(Canvas.global_light_color).multiplyScalar(settings.brightness.value / 50)},
				LIGHTSIDE: {type: 'int', value: Canvas.global_light_side},
				EMISSIVE: {type: 'bool', value: this.render_mode == 'emissive'}
			},
			vertexShader: vertShader,
			fragmentShader: fragShader,
			blending: this.render_mode == 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
			side: Canvas.getRenderSide(this),
			transparent: true,
		});
		mat.map = tex;
		mat.name = this.name;
		Project.materials[this.uuid] = mat;

		var size_control = {};

		this.img.onload = () => {
			tex.needsUpdate = true;
			let dimensions_changed = scope.width !== img.naturalWidth || scope.height !== img.naturalHeight;
			scope.width = img.naturalWidth;
			scope.height = img.naturalHeight;
			if (scope.selection) scope.selection.changeSize(scope.width, scope.height);
			if (img.naturalWidth > 16384 || img.naturalHeight > 16384) {
				scope.error = 2;
			}
			scope.currentFrame = Math.min(scope.currentFrame, (scope.frameCount||1)-1)

			if (img.update_from_canvas) {
				delete img.update_from_canvas;
			} else if (!scope.layers_enabled) {
				scope.canvas.width = scope.width;
				scope.canvas.height = scope.height;
				scope.ctx.drawImage(img, 0, 0);
			}

			if (this.flags.has('update_uv_size_from_resolution')) {
				this.flags.delete('update_uv_size_from_resolution');
				this.uv_width = scope.width;
				this.uv_height = scope.display_height;
			}

			if (scope.isDefault) {
				console.log('Successfully loaded '+scope.name+' from default pack')
			}

			let project = Texture.all.includes(scope) ? Project : ModelProject.all.find(project => project.textures.includes(scope));
			if(!project) return;
			project.whenNextOpen(() => {

				if (Project.box_uv && Format.single_texture && !scope.error) {

					if (!scope.keep_size) {
						let pw = scope.getUVWidth();
						let ph = scope.getUVHeight();
						let nw = img.naturalWidth;
						let nh = img.naturalHeight;

						//texture is unlike project
						var unlike = (pw != nw || ph != nh);
						//Resolution of this texture has changed
						var changed = size_control.old_width && (size_control.old_width != nw || size_control.old_height != nh);
						//Resolution could be a multiple of project size
						var multi = (
							(pw%nw == 0 || nw%pw == 0) &&
							(ph%nh == 0 || nh%ph == 0)
						)

						if (unlike && changed && !multi) {
							Blockbench.showMessageBox({
								translateKey: 'update_res',
								icon: 'photo_size_select_small',
								buttons: [tl('message.update_res.update'), tl('dialog.cancel')],
								confirm: 0,
								cancel: 1
							}, function(result) {
								if (result === 0) {
									setProjectResolution(img.naturalWidth, img.naturalHeight)
									if (selected.length) {
										UVEditor.loadData()
									}
								}
							})
						}
					}
					delete scope.keep_size;
					size_control.old_width = img.naturalWidth
					size_control.old_height = img.naturalHeight
				}

				if (dimensions_changed) {
					TextureAnimator.updateButton()
					Canvas.updateAllFaces(scope)
				}
				if (typeof scope.load_callback === 'function') {
					scope.load_callback(scope);
					delete scope.load_callback;
				}
			})
		}
		this.img.onerror = (error) => {
			if (isApp &&
				!scope.isDefault &&
				scope.mode !== 'bitmap' &&
				scope.fromDefaultPack()
			) {
				return true;
			} else {
				scope.loadEmpty()
			}
		}

		if (typeof data === 'object') {
			this.extend(data);
			if (this.layers_enabled) {
				setTimeout(() => {
					Project.whenNextOpen(() => {
						this.updateLayerChanges()
					})
				}, 40);
			}
		}
		if (!this.id) {
			var i = Texture.all.length;
			while (true) {
				var c = 0
				var duplicates = false;
				while (c < Texture.all.length) {
					if (Texture.all[c].id == i) {
						duplicates = true;
					}
					c++;
				}
				if (duplicates === true) {
					i++;
				} else {
					this.id = i.toString();
					break;
				}
			}
		}
	}

function processValue(v, type) {
	if (type.type === 'molang') {
		if (!isNaN(v)) {
			v = parseFloat(v)
		} else if (typeof v == 'string' && v.includes('\n')) {
			v = v.replace(/[\r\n]+/g, '');
		}
		if (!v) v = 0;
	} else if (type.type === 'number' && typeof v !== type.type) {
		v = parseFloat(v)||0;
	}
	return v;
}
function getValue(key, required) {

	let value = Config[key];
	let type = Config.constructor.types[key];

	if (type.array) {
		var result = [];
		for (var num of value) {
			result.push(processValue(num, type));
		}
		if (!result.find(v => v) && !required) result = undefined;
	} else {
		var result = processValue(value, type);
		if (!result && !required) result = undefined;
	}
	return result;
}
function formatEventList(list) {
	if (list.length == 1) {
		return list[0]
	} else if (list.length > 1) {
		return list;
	}
}
function formatEventTimeline(source) {
	let has_data = false;
	let copy = {};
	for (let key in source) {
		copy[key] = formatEventList(source[key]);
		if (copy[key]) has_data = true;
	}
	if (has_data) {
		return copy;
	}
}
function formatEventTimelineLooping(source) {
	if (!source) return;
	let copy_list = [];
	for (let entry of source) {
		let copy = {
			distance: entry.distance,
			effects: formatEventList(entry.effects)
		};
		copy_list.push(copy);
	}
	if (copy_list.length) {
		return copy_list;
	}
}


function generateFile() {
	var file = {
		format_version: '1.10.0',
		particle_effect: {
			description: {
				identifier: Config.identifier,
				basic_render_parameters: {
					material: Data.appearance.appearance.inputs.material.value,
					texture: getValue('particle_texture_path') || 'textures/blocks/wool_colored_white'
				}
			}
		},
		texture: ''
	}

	//Curves
	var json_curves = {};
	for (var key in Config.curves) {
		let curve = Config.curves[key];
		var json_curve = {
			type: processValue(curve.mode, {type: 'string'}),
			input: processValue(curve.input, {type: 'molang'}),
			horizontal_range: curve.mode == 'bezier_chain' ? undefined : processValue(curve.range, {type: 'molang'}),
			nodes: curve.nodes.slice()
		}
		if (json_curve.type == 'bezier_chain') {
			let nodes = {};
			json_curve.nodes.forEach(node => {
				let time = Math.roundTo(node.time, 2).toString();
				if (time.search(/\./) < 0) time += '.0'
				nodes[time] = {
					value: node.right_value == node.left_value ? node.left_value : undefined,
					left_value: node.right_value == node.left_value ? undefined : node.left_value,
					right_value: node.right_value == node.left_value ? undefined : node.right_value,

					slope: node.right_slope == node.left_slope ? node.left_slope : undefined,
					left_slope: node.right_slope == node.left_slope ? undefined : node.left_slope,
					right_slope: node.right_slope == node.left_slope ? undefined : node.right_slope,
				}
			})
			json_curve.nodes = nodes;
		}
		json_curves[key] = json_curve
	}
	if (Object.keys(json_curves).length) {
		file.particle_effect.curves  = json_curves;
	}

	//Events
	if (Data.events.events.events.length) {
		function cleanEvent(subpart) {
			if (!subpart) return;
			if (subpart.randomize instanceof Array) {
				for (let option of subpart.randomize) {
					delete option.uuid;
					cleanEvent(option);
				}
			}
			if (subpart.sequence instanceof Array) {
				for (let option of subpart.sequence) {
					delete option.uuid;
					cleanEvent(option);
				}
			}
			if (subpart.particle_effect) {
				let {particle_effect} = subpart;
				if (!particle_effect.pre_effect_expression) {
					delete particle_effect.pre_effect_expression;
				} else if (typeof particle_effect.pre_effect_expression == 'string') {
					particle_effect.pre_effect_expression = particle_effect.pre_effect_expression.trim();
					if (!particle_effect.pre_effect_expression.endsWith(';')) {
						particle_effect.pre_effect_expression = particle_effect.pre_effect_expression + ';';
					}
				}
			}
			return subpart;
		}
		file.particle_effect.events = {};
		for (let entry of Data.events.events.events) {
			let copy = JSON.parse(JSON.stringify(entry.event));
			file.particle_effect.events[entry.id] = cleanEvent(copy);
		}
	}

	var comps = file.particle_effect.components = {};

	//Emitter Components
	if (getValue('variables_creation_vars')) {
		var s = getValue('variables_creation_vars').join(';')+';';
		s = s.replace(/;;+/g, ';')
		if (s) {
			comps['minecraft:emitter_initialization'] = {
				creation_expression: s,
			}
		}
	}
	if (getValue('variables_tick_vars')) {
		var s = getValue('variables_tick_vars').join(';')+';';
		s = s.replace(/;;+/g, ';')
		if (s) {
			if (!comps['minecraft:emitter_initialization']) comps['minecraft:emitter_initialization'] = {};
			comps['minecraft:emitter_initialization'].per_update_expression = s;
		}
	}
	if (getValue('space_local_position', 'boolean')) {
		comps['minecraft:emitter_local_space'] = {
			position: getValue('space_local_position', 'boolean'),
			rotation: getValue('space_local_rotation', 'boolean'),
			velocity: getValue('space_local_velocity', 'boolean') || undefined,
		}
	}
	//Rate
	var mode = getValue('emitter_rate_mode')
	if (mode === 'instant') {
		comps['minecraft:emitter_rate_instant'] = {
			num_particles: getValue('emitter_rate_amount'),
		}
	} else if (mode === 'steady') {
		comps['minecraft:emitter_rate_steady'] = {
			spawn_rate: getValue('emitter_rate_rate'),
			max_particles: getValue('emitter_rate_maximum'),
		}
	} else if (mode === 'manual') {
		comps['minecraft:emitter_rate_manual'] = {
			max_particles: getValue('emitter_rate_maximum'),
		}
	}
	//Lifetime
	var mode = getValue('emitter_lifetime_mode')
	if (mode) {
		if (mode === 'looping') {
			comps['minecraft:emitter_lifetime_looping'] = {
				active_time: getValue('emitter_lifetime_active_time'),
				sleep_time: getValue('emitter_lifetime_sleep_time'),
			}
		} else if (mode === 'once') {
			comps['minecraft:emitter_lifetime_once'] = {
				active_time: getValue('emitter_lifetime_active_time'),
			}
		} else if (mode === 'expression') {
			comps['minecraft:emitter_lifetime_expression'] = {
				activation_expression: getValue('emitter_lifetime_activation'),
				expiration_expression: getValue('emitter_lifetime_expiration'),
			}
		}
	}
	//Particle Events
	let emitter_events = {
		creation_event: formatEventList(Config.emitter_events_creation),
		expiration_event: formatEventList(Config.emitter_events_expiration),
		timeline: formatEventTimeline(Config.emitter_events_timeline),
		travel_distance_events: formatEventTimeline(Config.emitter_events_distance),
		looping_travel_distance_events: formatEventTimelineLooping(Config.emitter_events_distance_looping),
	}
	if (emitter_events.creation_event || emitter_events.expiration_event || emitter_events.timeline || emitter_events.travel_distance_events || emitter_events.looping_travel_distance_events) {
		comps['minecraft:emitter_lifetime_events'] = emitter_events;
	}
	//Direction
	var mode = getValue('particle_direction_mode');
	var direction = undefined;
	if (mode) {
		if (mode === 'inwards') {
			direction = 'inwards'
		} else if (mode === 'outwards') {
			direction = 'outwards'
		} else if (mode === 'direction') {
			direction = getValue('particle_direction_direction')
		}
	}
	//Shape
	var mode = getValue('emitter_shape_mode')
	if (mode) {
		if (mode === 'point') {
			if (typeof direction === 'string') {
				direction = undefined;
			}
			comps['minecraft:emitter_shape_point'] = {
				offset: getValue('emitter_shape_offset'),
				direction: direction
			}
		} else if (mode === 'sphere') {
			comps['minecraft:emitter_shape_sphere'] = {
				offset: getValue('emitter_shape_offset'),
				radius: getValue('emitter_shape_radius'),
				surface_only: getValue('emitter_shape_surface_only'),
				direction: direction
			}
		} else if (mode === 'box') {
			comps['minecraft:emitter_shape_box'] = {
				offset: getValue('emitter_shape_offset'),
				half_dimensions: getValue('emitter_shape_half_dimensions'),
				surface_only: getValue('emitter_shape_surface_only'),
				direction: direction
			}
		} else if (mode === 'disc') {
			let plane_normal = getValue('emitter_shape_plane_normal')
			if (plane_normal) {
				switch (plane_normal.join('')) {
					case '100': plane_normal = 'x'; break;
					case '010': plane_normal = 'y'; break;
					case '001': plane_normal = 'z'; break;
				}
			}
			comps['minecraft:emitter_shape_disc'] = {
				offset: getValue('emitter_shape_offset'),
				radius: getValue('emitter_shape_radius'),
				plane_normal,
				surface_only: getValue('emitter_shape_surface_only'),
				direction: direction
			}
		} else if (mode === 'custom') {
			if (typeof direction === 'string') {
				direction = undefined;
			}
			comps['minecraft:emitter_shape_custom'] = {
				offset: getValue('emitter_shape_offset'),
				direction: direction
			}
		} else if (mode === 'entity_aabb') {
			comps['minecraft:emitter_shape_entity_aabb'] = {
				surface_only: getValue('emitter_shape_surface_only'),
				direction: direction
			}
		}
	}



	//Particle Components

	// Variables
	if (getValue('particle_update_expression')) {
		var s = getValue('particle_update_expression').join(';')+';';
		s = s.replace(/;;+/g, ';')
		if (s) {
			comps['minecraft:particle_initialization'] = {
				per_update_expression: s,
			}
		}
	}
	if (getValue('particle_render_expression')) {
		var s = getValue('particle_render_expression').join(';')+';';
		s = s.replace(/;;+/g, ';')
		if (s) {
			if (!comps['minecraft:particle_initialization']) comps['minecraft:particle_initialization'] = {};
			comps['minecraft:particle_initialization'].per_render_expression = s;
		}
	}

	//Lifetime
	comps['minecraft:particle_lifetime_expression'] = {
		max_lifetime: getValue('particle_lifetime_max_lifetime'),
		expiration_expression: getValue('particle_lifetime_expiration_expression')
	}
	if (getValue('particle_lifetime_expire_in')) {
		comps['minecraft:particle_expire_if_in_blocks'] = getValue('particle_lifetime_expire_in')
	}
	if (getValue('particle_lifetime_expire_outside')) {
		comps['minecraft:particle_expire_if_not_in_blocks'] = getValue('particle_lifetime_expire_outside')
	}

	//Particle Events
	let particle_events = {
		creation_event: formatEventList(Config.particle_events_creation),
		expiration_event: formatEventList(Config.particle_events_expiration),
		timeline: formatEventTimeline(Config.particle_events_timeline),
	}
	if (particle_events.creation_event || particle_events.expiration_event || particle_events.timeline) {
		comps['minecraft:particle_lifetime_events'] = particle_events;
	}

	//Spin
	var init_rot = getValue('particle_rotation_initial_rotation')
	var init_rot_rate = getValue('particle_rotation_rotation_rate')
	if (init_rot || init_rot_rate) {
		comps['minecraft:particle_initial_spin'] = {
			rotation: init_rot||undefined,
			rotation_rate: init_rot_rate||undefined
		}
	}
	comps['minecraft:particle_initial_speed'] = getValue('particle_motion_linear_speed');

	//Motion
	var mode = getValue('particle_motion_mode')
	if (mode) {
		if (mode === 'dynamic') {
			comps['minecraft:particle_motion_dynamic'] = {
				linear_acceleration: getValue('particle_motion_linear_acceleration'),
				linear_drag_coefficient: getValue('particle_motion_linear_drag_coefficient'),
			}
			if (!comps['minecraft:particle_initial_speed']) comps['minecraft:particle_initial_speed'] = 0;
		} else if (mode === 'parametric') {
			comps['minecraft:particle_motion_parametric'] = {
				relative_position: getValue('particle_motion_relative_position'),
				direction: getValue('particle_motion_direction'),
			}
		}
	}

	//Rotation
	var mode = getValue('particle_rotation_mode')
	if (mode) {
		if (mode === 'dynamic') {
			let rotation_acceleration = getValue('particle_rotation_rotation_acceleration');
			let rotation_drag_coefficient = getValue('particle_rotation_rotation_drag_coefficient');
			if (rotation_acceleration || rotation_drag_coefficient) {
				if (!comps['minecraft:particle_motion_dynamic']) comps['minecraft:particle_motion_dynamic'] = {};
				let dyn_mo = comps['minecraft:particle_motion_dynamic'];
				dyn_mo.rotation_acceleration = rotation_acceleration;
				dyn_mo.rotation_drag_coefficient = rotation_drag_coefficient;
			}
		} else if (mode === 'parametric') {
			let rotation = getValue('particle_rotation_rotation');
			if (rotation) {
				if (!comps['minecraft:particle_motion_parametric']) comps['minecraft:particle_motion_parametric'] = {};
				comps['minecraft:particle_motion_parametric'].rotation = rotation;
			}
		}
	}

	//Kill Plane
	comps['minecraft:particle_kill_plane'] = getValue('particle_lifetime_kill_plane');
	
	//Texture
	let facing_camera_mode = getValue('particle_appearance_facing_camera_mode');
	var tex_comp = comps['minecraft:particle_appearance_billboard'] = {
		size: getValue('particle_appearance_size'),
		facing_camera_mode: facing_camera_mode,
		
	}
	if ((facing_camera_mode.substring(0, 9) == 'direction' || facing_camera_mode == 'lookat_direction') &&
		(getValue('particle_appearance_speed_threshold') != 0.01 || getValue('particle_appearance_direction_mode') != 'derive_from_velocity')
	) {
		tex_comp.direction = {
			mode: getValue('particle_appearance_direction_mode')
		}
		if (tex_comp.direction.mode == 'derive_from_velocity') {
			tex_comp.direction.min_speed_threshold = getValue('particle_appearance_speed_threshold');
		} else {
			tex_comp.direction.custom_direction = getValue('particle_appearance_direction');
		}
	}
	if (getValue('particle_texture_mode') !== 'full') {
		tex_comp.uv = {
			texture_width: parseInt(Config.particle_texture_size[0]) || 0,
			texture_height: parseInt(Config.particle_texture_size[1]) || 0,
		}
		if (getValue('particle_texture_mode') === 'static') {
			tex_comp.uv.uv = getValue('particle_texture_uv')||[0, 0];
			tex_comp.uv.uv_size = getValue('particle_texture_uv_size')||[tex_comp.uv.texture_width, tex_comp.uv.texture_height];

		} else {
			tex_comp.uv.flipbook = {
				base_UV: getValue('particle_texture_uv', true),
				size_UV: getValue('particle_texture_uv_size', true),
				step_UV: getValue('particle_texture_uv_step', true),
				frames_per_second: getValue('particle_texture_frames_per_second'),
				max_frame: getValue('particle_texture_max_frame'),
				stretch_to_lifetime: getValue('particle_texture_stretch_to_lifetime'),
				loop: getValue('particle_texture_loop'),
			}
		}
	}
	//Collision
	if (getValue('particle_collision_toggle')) {
		comps['minecraft:particle_motion_collision'] = {
			enabled: getValue('particle_collision_enabled'),
			collision_drag: getValue('particle_collision_collision_drag'),
			coefficient_of_restitution: getValue('particle_collision_coefficient_of_restitution'),
			collision_radius: getValue('particle_collision_collision_radius'),
			expire_on_contact: getValue('particle_collision_expire_on_contact'),
			events: getValue('particle_collision_events'),
		}
	}
	if (getValue('particle_color_light')) {
		comps['minecraft:particle_appearance_lighting'] = {}
	}
	if (getValue('particle_color_mode') === 'static') {

		
		let value = getValue('particle_color_static').substr(1, 8)
		if (value.toLowerCase() != 'ffffff') {
			let color = value.match(/.{2}/g).map(c => {
				return parseInt(c, 16) / 255;
			})
			if (color.length == 3) color[3] = 1;
			comps['minecraft:particle_appearance_tinting'] = {
				color
			}
		}
	} else if (getValue('particle_color_mode') === 'gradient') {

		let range = getValue('particle_color_range')
		comps['minecraft:particle_appearance_tinting'] = {
			color: {
				interpolant: getValue('particle_color_interpolant'),
				gradient: Data.appearance.color.inputs.gradient.export(range||1)
			}
		}

	} else {
		var color = getValue('particle_color_expression')
		if (color instanceof Array) {
			color.forEach((s, i) => {
				if (typeof s == 'number') {
					color[i] = MathUtils.clamp(s, 0, 1);
				}
			})
			if (!color[3]) color[3] = 1;
			comps['minecraft:particle_appearance_tinting'] = {
				color: color
			}
		}
	}

	return file;
}
window.generateFileForParentEffect = function() {
	let json = generateFile();
	return JSON.stringify(json);
}
function getName() {
	var name = Data.effect.meta.inputs.identifier.value
	if (name) {
		name = name.replace(/^\w+:/, '');
	} else {
		name = 'particles';
	}
	return name;
}
function downloadFile() {
	var content = compileJSON(generateFile())
	IO.export({
		name: getName()+'.particle.json',
		content: content
	})
}


export {generateFile, downloadFile}
