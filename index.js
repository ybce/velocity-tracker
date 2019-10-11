const args = require('commander')
const inquirer = require('inquirer')

const packageInfo = require('./package.json')
const HttpUtil = require('./http')
const log = require('./logger')

log(`${packageInfo.name} v${packageInfo.version}`)

const httpUtil = new HttpUtil()

const POINTS_LABELS = [
  'Point: 0.5', 'Point: 1', 'Point: 2', 'Point: 3', 'Point: 5', 'Point: 8', 'Point: 13', 'Point: 21'
]

var questions = [{
  type: 'input',
  name: 'devs',
  message: 'How many devs did you have for this beat?'
},
{
  type: 'input',
  name: 'points',
  message: 'How many points did you commit to for this beat?'
},
{
  type: 'input',
  name: 'days',
  message: 'How many days did you have this beat?'
}
]

const POINTS_MAP = new Map([['Point: 0.5', 0.5], ['Point: 1', 1], ['Point: 2', 2], ['Point: 3', 3], ['Point: 5', 5], ['Point: 8', 8], ['Point: 13', 13], ['Point: 21', 21]])

const projectColumn = 'https://github.com/orgs/qlik-trial/projects/25#column-6312145'

args
  .version(packageInfo.version)
  .option('-t, --token [github_api_token]', 'Your GitHub API token', process.env.GITHUB_API_TOKEN)
  .option('-o, --owner [repo_owner]', 'The GitHub repo owner - username or org name', process.env.REPO_OWNER)
  .option('-r, --repo [repo_name]', 'The GitHub repo name', process.env.REPO_NAME)
  .option('-m, --milestone [number]', 'Repo milestone number filter (from the GitHub URL)', process.env.REPO_MILESTONE)
  .option('-l, --labels [label_list]', 'Comma-separated list of labels to filter on', process.env.REPO_LABELS)
  .option('-i, --issues [issue_nums]', 'Comma-separated list of issue numbers to include', process.env.REPO_ISSUES)
  .option('-p, --points', 'Flag to enable the points label on cards')
  .option('-b, --beat [beat]', 'BEAT', process.env.BEAT)
  .option('--project-column [url]', 'URL of GitHub project column to be printed', process.env.PROJECT_COLUMN_URL)
  .parse(process.argv)

// flag options can't have "values" so do the environment variable setting here
if (process.env.INCLUDE_POINTS_LABELS) {
  args.points = true
}

// verify that we have enough info to do something useful
if (!args.token) {
  console.error()
  console.error('Error: Missing GitHub API token!')
  args.help() // this automatically exits
}
// call async function from main without promise warnings
// https://stackoverflow.com/questions/46515764/how-can-i-use-async-await-at-the-top-level

async function getAnswers () {
  const answers = await inquirer.prompt(questions)
  return answers
}

(async () => {
  const answers = await getAnswers()
  const totalPoints = await processVelocity(args.token, projectColumn, args.beat)
  const results = processStats(totalPoints, answers)
  console.table(results)
})().catch(e => {
  console.log('ERROR:')
  console.log(e)
  process.exit(1)
})

function processStats (totalPoints, answers) {
  const pointsPerDev = totalPoints / answers.devs
  const pointsPerDays = pointsPerDev / answers.days
  const missedPoints = answers.points - totalPoints
  return { pointsCommited: Number(answers.points), beatLength: Number(answers.days), numberOfDevs: Number(answers.devs), pointsClosed: totalPoints, pointsPerDev, pointsPerDays, missedPoints }
}

async function processVelocity (bearerToken, url = projectColumn, beat) {
  const columnId = url.split('#column-')[1]
  const cardsUrl = `https://api.github.com/projects/columns/${columnId}/cards`
  const cardsBody = await httpUtil.httpGet(bearerToken, cardsUrl, { accept: 'application/vnd.github.inertia-preview+json' }
  ).catch((err) => {
    throw err
  })

  let count = 0
  for (const card of cardsBody) {
    if (card.content_url) {
      const cardContent = await httpUtil.httpGet(bearerToken, card.content_url).catch((err) => { throw err })
      if (cardContent.labels.find((label) => beat === label.name)) {
        const pointLabel = cardContent.labels.find((label) => POINTS_LABELS.includes(label.name))
        if (pointLabel) {
          const cardPoints = POINTS_MAP.get(pointLabel.name)
          count += cardPoints
        }
      }
    }
  }
  return count
}
