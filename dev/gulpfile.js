var gulp = require('gulp');
var sftp = require('gulp-sftp');
var cache = require('gulp-cached');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var livereload = require('gulp-livereload');
var browserify = require('browserify');
var babelify = require('babelify');
var source = require('vinyl-source-stream');
var sourcemaps = require('gulp-sourcemaps');
var buffer = require('vinyl-buffer');
var less = require('gulp-less');
var rsync = require('gulp-rsync');
var debug = require('gulp-debug');
// Sass-specific things:
var sass = require('gulp-sass');
var input = './IDE/public/styles/sass';
var output = './IDE/public/styles';
var rename = require('gulp-rename');


var host = '192.168.7.2';
var user = 'root';
var pass = 'a';
var remotePath = '/root/Bela/IDE/';

gulp.task('commit', ['browserify', 'scope-browserify']);

gulp.task('default', ['commit', 'killnode', 'upload', 'restartnode', 'watch', 'sass']);

gulp.task('watch', ['upload'], function(){

	livereload.listen();
	
	// when the node.js source files change, kill node, upload the files and restart node
	gulp.watch(['../IDE/index.js', '../IDE/libs/**'], ['killnode', 'upload', 'restartnode']);
	
	// when the browser js changes, browserify it
	gulp.watch(['./src/**'], ['browserify']);
	
	// when the scope browser js changes, browserify it
	gulp.watch(['./scope-src/**'], ['scope-browserify']);

	gulp.watch(['./src/styles/**'], ['sass']);
	
	// when the less changes, compile it and stick it in public/css
	// gulp.watch(['../IDE/public/less/**'], ['less']);
	
	// when the browser sources change, upload them without killing node
	gulp.watch(['../IDE/public/**', 
		'!../IDE/public/js/bundle.js.map', 
		'!../IDE/public/scope/js/bundle.js.map', 
		'!../IDE/public/js/ace/**'
	], ['upload-no-kill']);
	
});

gulp.task('upload', ['killnode'], (cb) => rSync(cb, false) );
gulp.task('upload-no-kill', (cb) => rSync(cb, true) );

gulp.task('nodemodules', ['upload-nodemodules', 'rebuild-nodemodules']);

gulp.task('upload-nodemodules', () => {
	return gulp.src(['../IDE/node_modules'])
		.pipe(rsync({
			root: '../IDE/node_modules/',
			hostname: user+'@'+host,
			destination: remotePath+'node_modules/',
			archive: true,
			clean: true,
			command: true
		}));
});

gulp.task('rebuild-nodemodules', ['upload-nodemodules'], (callback) => {

	console.log('rebuilding node modules');

	var ssh = spawn('ssh', [user+'@'+host, 'cd', remotePath+';', 'npm', 'rebuild']);
	
	ssh.stdout.setEncoding('utf8');
	ssh.stdout.on('data', function(data){
		process.stdout.write(data);
	});
	
	ssh.stderr.setEncoding('utf8');
	ssh.stderr.on('data', function(data){
		process.stdout.write('error: '+data);
	});
	
	ssh.on('exit', function(){
		callback();
	});
	
});

gulp.task('killnode', (callback) => {
	exec('ssh '+user+'@'+host+' "make -C Bela idestop; pkill -9 node"', (err) => {
		if (err) console.log('unable to stop node');
		callback(); // finished task
	});
});

gulp.task('startnode', startNode);
gulp.task('restartnode', ['upload'], startNode);

gulp.task('browserify', () => {
    return browserify('src/main.js', { debug: true })
    	.transform(babelify, {presets: ['es2015']})
        .bundle()
        .on('error', function(error){
    		console.error(error);
    		this.emit('end');
    	})
        .pipe(source('bundle.js'))
        .pipe(buffer())
		.pipe(sourcemaps.init({loadMaps: true}))
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('../IDE/public/js/'));
});
gulp.task('scope-browserify', () => {
    return browserify('scope-src/main.js', { debug: true })
    	.transform(babelify, {presets: ['es2015']})
        .bundle()
        .on('error', function(error){
    		console.error(error);
    		this.emit('end');
    	})
        .pipe(source('bundle.js'))
        .pipe(buffer())
		.pipe(sourcemaps.init({loadMaps: true}))
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('../IDE/public/scope/js/'));
});

// Sass task. Get to the first log point, seems to execute without error, never hits the second and there's no output:

gulp.task('sass', () => {
	console.log('sass reporting in');
  return gulp.src('./src/styles/**/*.scss')
    .pipe(sass('bela-style.css'))
    .pipe(gulp.dest('../IDE/public/styles'));
    console.log('a sphincter says what');
});

function startNode(callback){
	var ssh = spawn('ssh', [user+'@'+host, 'cd', remotePath+';', 'node', '/root/Bela/IDE/index.js']);
	
	ssh.stdout.setEncoding('utf8');
	ssh.stdout.on('data', function(data){
		process.stdout.write(data);
		if (data.indexOf('listening on port') !== -1) livereload.reload();
	});
	
	ssh.stderr.setEncoding('utf8');
	ssh.stderr.on('data', function(data){
		process.stdout.write('error: '+data);
	});

	callback();
}

function rSync(callback, reload){

	var ssh = spawn('rsync', ['-av', '--delete', '--exclude=settings.json', '../IDE/', user+'@'+host+':'+remotePath]);
	
	ssh.stdout.setEncoding('utf8');
	ssh.stdout.on('data', function(data){
		process.stdout.write(data);
	});
	
	ssh.stderr.setEncoding('utf8');
	ssh.stderr.on('data', function(data){
		process.stdout.write('error: '+data);
	});
	
	ssh.on('exit', function(){
		callback();
		if (reload) livereload.reload();
	});
	
};
