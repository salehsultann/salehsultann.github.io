
let controlsDiv, resultsDiv
let controls = {}
let helpDivs, showHelpLink, hideHelpLink
let groups = 0
let ofSize = 0
let forRounds = 0
let playerNames = []
let forbiddenPairs = Immutable.Set()
let discouragedGroups = Immutable.Set()
let startTime
let lastResults

const myWorker = new Worker('lib/worker.js');

function init() {
  myWorker.addEventListener('message', onResults, false);

  controlsDiv = document.getElementById('controls')
  resultsDiv = document.getElementById('results')
  helpDivs = document.querySelectorAll('.help-text')

  showHelpLink = document.getElementById("show-help-link")
  hideHelpLink = document.getElementById("hide-help-link")

  controls.recomputeButton = controlsDiv.querySelector('#recomputeButton')
  controls.groupsLabel = controlsDiv.querySelector('#groupsLabel')
  controls.groupsSlider = controlsDiv.querySelector('#groupsSlider')
  controls.ofSizeLabel = controlsDiv.querySelector('#ofSizeLabel')
  controls.ofSizeSlider = controlsDiv.querySelector('#ofSizeSlider')
  controls.forRoundsLabel = controlsDiv.querySelector('#forRoundsLabel')
  controls.forRoundsSlider = controlsDiv.querySelector('#forRoundsSlider')
  controls.playerNames = controlsDiv.querySelector('#playerNames')
  controls.forbiddenPairs = controlsDiv.querySelector('#forbiddenPairs')
  controls.discouragedGroups = controlsDiv.querySelector('#discouragedGroups')

  // User input controls
  controls.recomputeButton.onclick = recomputeResults;
  controls.groupsSlider.oninput = onSliderMoved
  controls.ofSizeSlider.oninput = onSliderMoved
  controls.forRoundsSlider.oninput = onSliderMoved
  controls.playerNames.onkeyup = onPlayerNamesKeyUp
  controls.playerNames.onchange = onPlayerNamesChanged
  controls.forbiddenPairs.onchange = onForbiddenPairsChanged
  controls.discouragedGroups.onchange = onDiscouragedGroupsChanged

  try {
    loadStateFromLocalStorage()
  } catch {
    console.info('Failed to load previous state');
  }

  playerNames = readPlayerNames()
  readConstraints(playerNames)
  onSliderMoved()

  if (lastResults) {
    renderResults()
  } else {
    recomputeResults()
  }
}

function onResults(e) {
  lastResults = e.data
  renderResults()
  if (lastResults.done) {
    saveStateToLocalStorage()
    enableControls()
  }
}

function recomputeResults() {
  startTime = Date.now();
  lastResults = null;
  renderResults()
  disableControls()
  myWorker.postMessage({groups, ofSize, forRounds, forbiddenPairs: forbiddenPairs.toJS(), discouragedGroups: discouragedGroups.toJS()})
}
function saveStateToLocalStorage() {
  localStorage.setItem('appState', JSON.stringify({
    groups,
    ofSize,
    forRounds,
    playerNames,
    forbiddenPairs: forbiddenPairs.toJS(),
    discouragedGroups: discouragedGroups.toJS(),
    lastResults
  }))
}

function loadStateFromLocalStorage() {
  const state = JSON.parse(localStorage.getItem('appState'))
  if (!state) throw new Error('Failed to load stored state')

  controls.groupsSlider.value = state.groups
  controls.ofSizeSlider.value = state.ofSize
  controls.forRoundsSlider.value = state.forRounds
  controls.playerNames.value = state.playerNames.join("\n")
  controls.forbiddenPairs.value = state.forbiddenPairs.map(x => x.map(i => state.playerNames[i]).join(",")).join("\n")
  controls.discouragedGroups.value = state.discouragedGroups.map(x => x.map(i => state.playerNames[i]).join(",")).join("\n")
  lastResults = state.lastResults
}

function onSliderMoved() {
  groups = parseInt(controls.groupsSlider.value, 10)
  ofSize = parseInt(controls.ofSizeSlider.value, 10)
  forRounds = parseInt(controls.forRoundsSlider.value, 10)

  // Update labels
  controls.groupsLabel.textContent = groups
  controls.ofSizeLabel.textContent = ofSize
  controls.forRoundsLabel.textContent = forRounds
}

function disableControls() {
  controls.recomputeButton.disabled = true
  controls.groupsSlider.disabled = true
  controls.ofSizeSlider.disabled = true
  controls.forRoundsSlider.disabled = true
  controls.playerNames.disabled = true
  controls.forbiddenPairs.disabled = true
  controls.discouragedGroups.disabled = true
  
  // Show spinner
}

function enableControls() {
  controls.recomputeButton.disabled = false
  controls.groupsSlider.disabled = false
  controls.ofSizeSlider.disabled = false
  controls.forRoundsSlider.disabled = false
  controls.playerNames.disabled = false
  controls.forbiddenPairs.disabled = false
  controls.discouragedGroups.disabled = false
  
  // Hide spinner
}

function readPlayerNames() {
  return controls.playerNames.value
    .split('\n')
    .map(name => name.trim())
}

function onPlayerNamesKeyUp() {
  playerNames = readPlayerNames()
  renderResults()
}

function onPlayerNamesChanged() {
  playerNames = readPlayerNames()
  renderResults()
}

function onForbiddenPairsChanged() {
  forbiddenPairs = readGroupConstraintFromControl(controls.forbiddenPairs, playerNames)
}

function onDiscouragedGroupsChanged() {
  discouragedGroups = readGroupConstraintFromControl(controls.discouragedGroups, playerNames)
}

function showHelp() {
  resultsDiv.style.opacity = "0.4"
  showHelpLink.style.display = "none"
  hideHelpLink.style.display = "inline"
  for (const div of helpDivs) {
    div.style.display = 'block'
  }
}

function hideHelp() {
  resultsDiv.style.opacity = "1"
  showHelpLink.style.display = "inline"
  hideHelpLink.style.display = "none"
  for (const div of helpDivs) {
    div.style.display = 'none'
  }
}

function readConstraints(playerNames) {
  forbiddenPairs = readGroupConstraintFromControl(controls.forbiddenPairs, playerNames)
  discouragedGroups = readGroupConstraintFromControl(controls.discouragedGroups, playerNames)
}

/**
 * Given a textarea containing multiple comma-separated lists of player names,
 * where the lists are separated by newlines, returns a set of sets of player
 * ids suitable for passing as a contstraint to the solver.
 * Names not found in the provided playerNames list are ignored.
 * @param {HTMLTextAreaElement} control
 * @param {Array<string>} playerNames 
 * @returns {Immutable.Set<Immutable.Set<number>>}
 */
function readGroupConstraintFromControl(control, playerNames) {
  return control.value
    .split('\n')
    .map(playerNameList =>
      playerNameList
        .split(',')
        .map(name => name.trim()))
    // Drop lines that aren't groups
    .filter(group => group.length >= 2)
    // Convert player names to indices
    .reduce((memo, group) => {
      let groupSet = Immutable.Set()
      for (const playerName of group) {
        for (const index of indicesOf(playerName, playerNames)) {
          groupSet = groupSet.add(index)
        }
      }
      // Ignore single-member groups, since they don't make useful constraints.
      return groupSet.size >= 2 ? memo.add(groupSet) : memo;
    }, Immutable.Set())
}

function indicesOf(needle, haystack) {
  const indices = []
  let nextIndex = -1
  do {
    nextIndex = haystack.indexOf(needle, nextIndex + 1)
    if (nextIndex > -1) indices.push(nextIndex)
  } while (nextIndex > -1)
  return indices
}

function playerName(i) {
  return playerNames[i] ? playerNames[i] : `Player ${i+1}`
}

function downloadCsv() {
  // Pivot results into a table that's easier to work with
  const roundNames = lastResults.rounds.map((_, i) => `Round ${i + 1}`)
  const playerCount = lastResults.rounds[0].length * lastResults.rounds[0][0].length
  
  // Stub out a row for each player
  const players = []
  for (let i = 0; i < playerCount; i++) {
    players.push([playerName(i)])
  }
  
  // Fill in assigned groups
  lastResults.rounds.forEach((round) => {
    round.forEach((group, j) => {
      group.forEach(playerIndex => {
        players[playerIndex].push(`Group ${j + 1}`)
      })
    })
  })
  
  // Build table
  const rows = [
    ['', ...roundNames],
    ...players
  ]
  // For debugging: console.table(rows);
  
  let csvContent = "data:text/csv;charset=utf-8," 
    + rows.map(e => e.join(",")).join("\n");
  
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement("a")
  link.setAttribute("href", encodedUri)
  link.setAttribute("İndir", "nesibe_aydin.csv")
  document.body.appendChild(link)
  link.click()
}

function renderResults() {
  resultsDiv.innerHTML = ''
  if (lastResults) {
    lastResults.rounds.forEach((round, roundIndex) => {
      const roundDiv = document.createElement('div')
      roundDiv.classList.add('round')
  
      const groups = document.createElement('div')
      groups.classList.add('groups')
  
      round.forEach((group, groupIndex) => {
        const groupDiv = document.createElement('div')
        groupDiv.classList.add('group')
        const groupName = document.createElement('h2')
        groupName.textContent = `Group ${groupIndex + 1}`
        groupDiv.appendChild(groupName)
  
        const members = document.createElement('ul')
        group.sort((a, b) => parseInt(a) < parseInt(b) ? -1 : 1).forEach(personNumber => {
          const member = document.createElement('li')
          member.textContent = playerName(personNumber)
          members.appendChild(member)
        })
        groupDiv.appendChild(members)
  
        groups.appendChild(groupDiv)
      })
  
      roundDiv.appendChild(header)
      roundDiv.appendChild(groups)
      resultsDiv.appendChild(roundDiv)
    })
    
    if (lastResults.done) {
      // Summary div - total time and CSV download
      const summaryDiv = document.createElement('div')
      summaryDiv.classList.add('resultsSummary');
      summaryDiv.style.borderTop = 'solid #aaaaaa thin'
      summaryDiv.style.padding = '7px 0'

      const csvButton = document.createElement('button')
      csvButton.type = 'button'
      csvButton.appendChild(document.createTextNode('Excel İndir'))
      csvButton.onclick = downloadCsv

      const printButton = document.createElement('button')
      printButton.type = 'button'
      printButton.appendChild(document.createTextNode('Çıktı Al'))
      printButton.onclick = () => window.print()
      
      const elapsedTime = document.createElement('span')
      elapsedTime.style.fontStyle = 'italic'
      elapsedTime.style.fontSize = 'smaller'
      if (startTime) {
        const elapsedSecs = Math.round((Date.now() - startTime) / 100) / 10
        elapsedTime.textContent = ` ${elapsedSecs} saniye içinde yüklendi.`
      } else {
        elapsedTime.textContent = `Yedeklemeden geri yüklendi.`
      }
      
      summaryDiv.appendChild(elapsedTime)
      summaryDiv.appendChild(csvButton)
      summaryDiv.appendChild(printButton)
      resultsDiv.appendChild(summaryDiv)
    } else {
      resultsDiv.appendChild(document.createTextNode('Thinking...'));
    }
  }
}

document.addEventListener('DOMContentLoaded', init)