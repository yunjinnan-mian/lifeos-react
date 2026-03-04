export default function Toast({ msg, visible }) {
  return (
    <div id="toast" className={visible ? 'visible' : ''}>
      {msg}
    </div>
  );
}
