import './App.css'
import AudioRecorder from './components/AudioRecorder'

const App = () => {
  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '2.4rem', marginBottom: '0.25rem', lineHeight: 1.1 }}>EchoTutor</h1>
        <p style={{ fontSize: '1rem', color: '#888', margin: 0 }}>Your Friendly AI English Coach</p>
      </div>
      <AudioRecorder />
    </>
  )
}

export default App
