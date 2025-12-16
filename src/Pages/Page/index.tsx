import HomePage from "../Home"

import { PageSetter } from "../../App"

function Page() {
    return (
        <div style={{width:"100%", height:"100%"}}>
            <h1>Page</h1>
            <button onClick={() => PageSetter(<HomePage/>)}>home</button>
        </div>
    )
}

export default Page