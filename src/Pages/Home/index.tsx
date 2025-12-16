import Page from "../Page"

import { PageSetter } from "../../App"

function HomePage() {
    return (
        <div style={{width:"100%", height:"100%"}}>
            <h1>Home</h1>
            <button onClick={() => PageSetter(<Page/>)}>page</button>
        </div>
    )
}

export default HomePage