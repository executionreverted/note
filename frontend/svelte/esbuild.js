const esbuild = require('esbuild')
const sveltePreprocess = require('svelte-preprocess')
const sveltePlugin = require('esbuild-svelte') // esbuild plugin svelte

function showUsage() {
  console.log('USAGE')
  console.log('node esbuild.js dev')
  console.log('node esbuild.js watch')
  console.log('node esbuild.js prod')
  process.exit(0)
}

if (process.argv.length < 3) {
  showUsage()
}

if (!['dev', 'watch', 'prod'].includes(process.argv[2])) {
  showUsage()
}

// production mode, or not
const production = (process.argv[2] === 'prod')

// esbuild watch in dev mode to rebuild out files
let watch = false
if (process.argv[2] === 'watch') {
  watch = {
    onRebuild(error) {
      if (error) console.error('esbuild: Watch build failed:', error.getMessage())
      else console.log('esbuild: Watch build succeeded')
    }
  }
}

// esbuild build options
// see: https://esbuild.github.io/api/#build-api
const options = {
  charset: "utf8",
  entryPoints: ['./src/main.ts'],
  bundle: true,
  watch,
  external: ['electron'],
  format: 'esm',
  minify: production,
  sourcemap: false,
  outfile: '../electron/public/bundle.js', // and bundle.css
  pure: production ? ['console.log', 'console.time', 'console.timeEnd'] : [], // remove console.*
  plugins: [
    sveltePlugin({ preprocess: sveltePreprocess() })
  ]
}

// esbuild dev + prod
esbuild.build(options).catch((err) => {
  console.error(err)
  process.exit(1)
})
