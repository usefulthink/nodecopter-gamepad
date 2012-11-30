module.exports = function (grunt) {
    grunt.initConfig({
        lint: {
            all:['*.js', 'lib/**/*.js', 'spec/**/*.js']
        },
        jshint: {
            options: {
                browser:true
            }
        },

        jasmine_node: { projectRoot: "." }
    });

    grunt.loadNpmTasks('grunt-jasmine-node');

    // register the default-task
    grunt.registerTask('default', 'lint jasmine_node');
};
