import {ReactNode, useState } from "react"
import HomePage from "./Pages/Home"

export var PageSetter = (_: ReactNode) => {} 

function App() {
    const [currentPage, setCurrentPage] = useState<ReactNode>(<HomePage/>)

    PageSetter = setCurrentPage

    return currentPage
}

export default App
