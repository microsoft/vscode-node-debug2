/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const gulp = require('gulp');
const path = require('path');
const ts = require('gulp-typescript');
const log = require('gulp-util').log;
const typescript = require('typescript');
const sourcemaps = require('gulp-sourcemaps');
const tslint = require('gulp-tslint');

const sources = [
    'src',
    'test',
    'node_modules/@types'
].map(function(tsFolder) { return tsFolder + '/**/*.ts'; });

const scripts = [
    'src/terminateProcess.sh'
];

const lintSources = [
    'src'
].map(function(tsFolder) { return tsFolder + '/**/*.ts'; });

function computeSourceRoot(file) {
    return path.relative(path.dirname(file.path), __dirname);
}

const tsProject = ts.createProject('tsconfig.json', { typescript });
gulp.task('build', ['copy-scripts'], function () {
	return gulp.src(sources, { base: '.' })
        .pipe(sourcemaps.init())
        .pipe(ts(tsProject)).js
        .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: computeSourceRoot }))
        .pipe(gulp.dest('out'));
});

gulp.task('copy-scripts', () => {
    return gulp.src(scripts, { base: '.' })
        .pipe(gulp.dest('out'));
});

gulp.task('watch', ['build'], function(cb) {
    log('Watching build sources...');
    return gulp.watch(sources, ['build']);
});

gulp.task('default', ['build']);

gulp.task('tslint', function() {
      return gulp.src(lintSources, { base: '.' })
        .pipe(tslint())
        .pipe(tslint.report('verbose'));
});
